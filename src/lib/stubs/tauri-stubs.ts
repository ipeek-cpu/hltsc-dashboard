/**
 * Stub exports for Tauri plugins when running in browser/dev mode
 * These are only used when the actual Tauri plugins are not available
 */

// Stub functions that do nothing
export const open = async () => {
	console.warn('[Tauri Stub] open() called in non-Tauri environment');
};

export const check = async () => {
	console.warn('[Tauri Stub] check() called in non-Tauri environment');
	return null;
};

export const ask = async () => {
	console.warn('[Tauri Stub] ask() called in non-Tauri environment');
	return false;
};

export const relaunch = async () => {
	console.warn('[Tauri Stub] relaunch() called in non-Tauri environment');
};

export const openUrl = async () => {
	console.warn('[Tauri Stub] openUrl() called in non-Tauri environment');
};

export const listen = async () => {
	console.warn('[Tauri Stub] listen() called in non-Tauri environment');
	return () => {}; // Return unlisten function
};

export const emit = async () => {
	console.warn('[Tauri Stub] emit() called in non-Tauri environment');
};

export const sendNotification = async () => {
	console.warn('[Tauri Stub] sendNotification() called in non-Tauri environment');
};

export const isPermissionGranted = async () => {
	console.warn('[Tauri Stub] isPermissionGranted() called in non-Tauri environment');
	return false;
};

export const requestPermission = async () => {
	console.warn('[Tauri Stub] requestPermission() called in non-Tauri environment');
	return 'denied';
};

// Default export for modules that use default import
export default {
	open,
	check,
	ask,
	relaunch,
	openUrl,
	listen,
	emit,
	sendNotification,
	isPermissionGranted,
	requestPermission
};
