import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	listLogFiles,
	getLogDir,
	rotateOldLogs,
	clearAllLogs,
	formatBytes,
	appLogger
} from '$lib/logger';

/**
 * GET /api/logs - List all log files
 */
export const GET: RequestHandler = async () => {
	try {
		const files = listLogFiles();
		const logDir = getLogDir();

		const fileInfo = files.map((f) => ({
			name: f.name,
			path: f.path,
			size: f.size,
			sizeFormatted: formatBytes(f.size),
			modified: f.modified.toISOString()
		}));

		const totalSize = files.reduce((sum, f) => sum + f.size, 0);

		appLogger.debug('Listed log files', { count: files.length, totalSize });

		return json({
			logDir,
			files: fileInfo,
			totalSize,
			totalSizeFormatted: formatBytes(totalSize)
		});
	} catch (err) {
		appLogger.error('Failed to list log files', {
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'Failed to list log files' },
			{ status: 500 }
		);
	}
};

/**
 * POST /api/logs - Perform log operations
 *
 * Body: { action: 'rotate' | 'clear' }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action } = body as { action: string };

		if (action === 'rotate') {
			const result = rotateOldLogs();
			appLogger.info('Rotated old logs', {
				deleted: result.deleted.length,
				errors: result.errors.length
			});
			return json({
				success: true,
				action: 'rotate',
				deleted: result.deleted,
				errors: result.errors
			});
		}

		if (action === 'clear') {
			const result = clearAllLogs();
			appLogger.info('Cleared all logs', {
				cleared: result.cleared.length,
				errors: result.errors.length
			});
			return json({
				success: true,
				action: 'clear',
				cleared: result.cleared,
				errors: result.errors
			});
		}

		return json(
			{ error: 'Invalid action. Use "rotate" or "clear"' },
			{ status: 400 }
		);
	} catch (err) {
		appLogger.error('Log operation failed', {
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'Operation failed' },
			{ status: 500 }
		);
	}
};
