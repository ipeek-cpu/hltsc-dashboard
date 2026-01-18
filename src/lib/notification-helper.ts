/**
 * Notification Helper - Send native OS notifications via Tauri
 *
 * This module provides a server-side interface for triggering notifications.
 * Since Tauri notifications are client-side, we broadcast to clients via SSE
 * and let the client trigger the actual notification.
 */

export interface NotificationRequest {
	type: 'awaiting_input' | 'completed' | 'failed';
	title: string;
	body: string;
	taskRunId: string;
	projectId: string;
	issueId: string;
}

// Notification queue - clients poll this to know when to show notifications
const pendingNotifications: NotificationRequest[] = [];

// SSE controllers for notification broadcasts
const notificationSSEControllers = new Set<ReadableStreamDefaultController>();

/**
 * Queue a notification to be sent to clients
 */
export function queueNotification(notification: NotificationRequest): void {
	pendingNotifications.push(notification);
	broadcastNotification(notification);
}

/**
 * Register an SSE controller for notification broadcasts
 */
export function registerNotificationSSE(controller: ReadableStreamDefaultController): void {
	notificationSSEControllers.add(controller);
}

/**
 * Unregister an SSE controller
 */
export function unregisterNotificationSSE(controller: ReadableStreamDefaultController): void {
	notificationSSEControllers.delete(controller);
}

/**
 * Broadcast a notification to all connected clients
 */
function broadcastNotification(notification: NotificationRequest): void {
	const encoder = new TextEncoder();
	const data = `data: ${JSON.stringify(notification)}\n\n`;

	for (const controller of notificationSSEControllers) {
		try {
			controller.enqueue(encoder.encode(data));
		} catch {
			notificationSSEControllers.delete(controller);
		}
	}
}

/**
 * Helper to create awaiting input notification
 */
export function notifyAwaitingInput(params: {
	taskRunId: string;
	projectId: string;
	issueId: string;
	issueTitle: string;
}): void {
	queueNotification({
		type: 'awaiting_input',
		title: 'Task needs your input',
		body: `${params.issueTitle} - Claude is waiting for your response`,
		taskRunId: params.taskRunId,
		projectId: params.projectId,
		issueId: params.issueId
	});
}

/**
 * Helper to create task completed notification
 */
export function notifyTaskCompleted(params: {
	taskRunId: string;
	projectId: string;
	issueId: string;
	issueTitle: string;
	success: boolean;
}): void {
	queueNotification({
		type: params.success ? 'completed' : 'failed',
		title: params.success ? 'Task completed' : 'Task failed',
		body: params.issueTitle,
		taskRunId: params.taskRunId,
		projectId: params.projectId,
		issueId: params.issueId
	});
}
