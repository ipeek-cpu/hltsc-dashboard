import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RequestHandler } from './$types';

export interface DirectoryEntry {
	name: string;
	path: string;
	isBeadsProject: boolean;
	hasBeadsDir: boolean; // Has .beads directory (may be partial init)
}

export interface BrowseResponse {
	currentPath: string;
	parentPath: string | null;
	directories: DirectoryEntry[];
	isBeadsProject: boolean;
	hasBeadsDir: boolean;
}

function isBeadsProject(dirPath: string): boolean {
	const beadsDbPath = path.join(dirPath, '.beads', 'beads.db');
	return fs.existsSync(beadsDbPath);
}

function hasBeadsDir(dirPath: string): boolean {
	const beadsDir = path.join(dirPath, '.beads');
	return fs.existsSync(beadsDir);
}

function getDirectories(dirPath: string): DirectoryEntry[] {
	try {
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		const directories: DirectoryEntry[] = [];

		for (const entry of entries) {
			// Skip hidden files/folders (except we want to show them if explicitly navigated to)
			if (entry.name.startsWith('.')) continue;

			if (entry.isDirectory()) {
				const fullPath = path.join(dirPath, entry.name);

				// Skip directories we can't access
				try {
					fs.accessSync(fullPath, fs.constants.R_OK);
					directories.push({
						name: entry.name,
						path: fullPath,
						isBeadsProject: isBeadsProject(fullPath),
						hasBeadsDir: hasBeadsDir(fullPath)
					});
				} catch {
					// Skip inaccessible directories
				}
			}
		}

		// Sort: Beads projects first, then folders with .beads dir, then alphabetically
		directories.sort((a, b) => {
			// Fully initialized beads projects first
			if (a.isBeadsProject && !b.isBeadsProject) return -1;
			if (!a.isBeadsProject && b.isBeadsProject) return 1;
			// Then folders with .beads directory (partial init)
			if (a.hasBeadsDir && !b.hasBeadsDir) return -1;
			if (!a.hasBeadsDir && b.hasBeadsDir) return 1;
			return a.name.localeCompare(b.name);
		});

		return directories;
	} catch {
		return [];
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const requestedPath = url.searchParams.get('path');

	// Default to home directory
	let currentPath = requestedPath || os.homedir();

	// Resolve to absolute path and normalize
	currentPath = path.resolve(currentPath);

	// Security: Ensure the path exists and is a directory
	try {
		const stats = fs.statSync(currentPath);
		if (!stats.isDirectory()) {
			return json({ error: 'Path is not a directory' }, { status: 400 });
		}
	} catch {
		// If path doesn't exist, fall back to home
		currentPath = os.homedir();
	}

	// Get parent path (null if at root)
	const parentPath = path.dirname(currentPath);
	const hasParent = parentPath !== currentPath;

	const response: BrowseResponse = {
		currentPath,
		parentPath: hasParent ? parentPath : null,
		directories: getDirectories(currentPath),
		isBeadsProject: isBeadsProject(currentPath),
		hasBeadsDir: hasBeadsDir(currentPath)
	};

	return json(response);
};
