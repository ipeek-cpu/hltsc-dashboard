import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { filePath } = await request.json();

		if (!filePath || typeof filePath !== 'string') {
			return json({ error: 'File path is required' }, { status: 400 });
		}

		// Get the directory containing the file
		const dirPath = path.dirname(filePath);

		// Check if directory exists
		if (!fs.existsSync(dirPath)) {
			return json({ error: 'Directory not found' }, { status: 404 });
		}

		// Check if the file exists - if so, reveal it; otherwise just open the folder
		const fileExists = fs.existsSync(filePath);

		// macOS: use 'open -R' to reveal file in Finder, or 'open' to open folder
		// Windows: use 'explorer /select,' to reveal file
		// Linux: use 'xdg-open' to open folder
		const platform = process.platform;

		let command: string;
		if (platform === 'darwin') {
			// macOS - reveal file in Finder or open folder
			if (fileExists) {
				command = `open -R "${filePath}"`;
			} else {
				command = `open "${dirPath}"`;
			}
		} else if (platform === 'win32') {
			// Windows
			if (fileExists) {
				command = `explorer /select,"${filePath}"`;
			} else {
				command = `explorer "${dirPath}"`;
			}
		} else {
			// Linux and others
			command = `xdg-open "${dirPath}"`;
		}

		await execAsync(command);

		return json({ success: true });
	} catch (error) {
		console.error('[open-folder] Error:', error);
		return json({ error: 'Failed to open folder' }, { status: 500 });
	}
};
