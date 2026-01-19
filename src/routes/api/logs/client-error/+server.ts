import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { appLogger } from '$lib/logger';

/**
 * Client-side error logging endpoint
 *
 * Receives error reports from the browser and logs them server-side
 * for debugging and observability.
 */

interface ClientErrorReport {
	message: string;
	stack?: string;
	url: string;
	userAgent: string;
	timestamp: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const errorReport: ClientErrorReport = await request.json();

		// Validate required fields
		if (!errorReport.message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		// Log the client error
		appLogger.error('Client-side error', {
			clientError: true,
			message: errorReport.message,
			stack: errorReport.stack,
			url: errorReport.url,
			userAgent: errorReport.userAgent,
			timestamp: errorReport.timestamp
		});

		return json({ logged: true });
	} catch (err) {
		appLogger.error('Failed to process client error report', {
			error: err instanceof Error ? err.message : String(err)
		});

		return json({ error: 'Failed to process error report' }, { status: 500 });
	}
};
