/**
 * Git utilities for Version History feature
 * Provides user-friendly git operations with safety checks
 */

import { spawnSync } from 'child_process';

export interface GitStatus {
	hasChanges: boolean;
	staged: GitFileChange[];
	unstaged: GitFileChange[];
	untracked: string[];
	summary: string;
}

export interface GitFileChange {
	path: string;
	status: 'added' | 'modified' | 'deleted' | 'renamed';
	oldPath?: string; // For renames
}

export interface GitCommit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	authorEmail: string;
	date: string;
	timestamp: number;
	filesChanged: number;
	insertions: number;
	deletions: number;
	isClaude: boolean; // Was this commit made by Claude?
}

export interface GitBranch {
	name: string;
	isCurrent: boolean;
	isRemote: boolean;
	lastCommit?: string;
}

export interface GitDiff {
	files: GitDiffFile[];
	summary: string;
}

export interface GitDiffFile {
	path: string;
	status: 'added' | 'modified' | 'deleted' | 'renamed';
	additions: number;
	deletions: number;
	diff: string; // The actual diff content
}

/**
 * Execute a git command and return the output
 * Uses spawnSync to avoid shell interpretation of special characters
 */
function execGit(projectPath: string, args: string[], options?: { timeout?: number }): string {
	try {
		const result = spawnSync('git', args, {
			cwd: projectPath,
			encoding: 'utf-8',
			timeout: options?.timeout || 30000,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		if (result.error) {
			throw result.error;
		}

		if (result.status !== 0) {
			throw new Error(result.stderr || `Git command failed with status ${result.status}`);
		}

		return (result.stdout || '').trim();
	} catch (error: unknown) {
		const execError = error as { stderr?: string; message?: string };
		throw new Error(`Git command failed: ${execError.stderr || execError.message}`);
	}
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(projectPath: string): boolean {
	try {
		execGit(projectPath, ['rev-parse', '--git-dir']);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the current git status (staged, unstaged, untracked files)
 */
export function getStatus(projectPath: string): GitStatus {
	const output = execGit(projectPath, ['status', '--porcelain=v1']);

	const staged: GitFileChange[] = [];
	const unstaged: GitFileChange[] = [];
	const untracked: string[] = [];

	if (!output) {
		return { hasChanges: false, staged, unstaged, untracked, summary: 'No changes' };
	}

	const lines = output.split('\n').filter(Boolean);

	for (const line of lines) {
		const indexStatus = line[0];
		const workTreeStatus = line[1];
		const path = line.slice(3);

		// Untracked files
		if (indexStatus === '?' && workTreeStatus === '?') {
			untracked.push(path);
			continue;
		}

		// Staged changes (index status)
		if (indexStatus !== ' ' && indexStatus !== '?') {
			staged.push({
				path,
				status: parseStatus(indexStatus)
			});
		}

		// Unstaged changes (work tree status)
		if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
			unstaged.push({
				path,
				status: parseStatus(workTreeStatus)
			});
		}
	}

	const totalChanges = staged.length + unstaged.length + untracked.length;
	const parts: string[] = [];
	if (staged.length > 0) parts.push(`${staged.length} staged`);
	if (unstaged.length > 0) parts.push(`${unstaged.length} modified`);
	if (untracked.length > 0) parts.push(`${untracked.length} new`);

	return {
		hasChanges: totalChanges > 0,
		staged,
		unstaged,
		untracked,
		summary: parts.length > 0 ? parts.join(', ') : 'No changes'
	};
}

function parseStatus(char: string): 'added' | 'modified' | 'deleted' | 'renamed' {
	switch (char) {
		case 'A': return 'added';
		case 'M': return 'modified';
		case 'D': return 'deleted';
		case 'R': return 'renamed';
		default: return 'modified';
	}
}

/**
 * Get commit history
 */
export function getLog(projectPath: string, limit: number = 50): GitCommit[] {
	// Format: hash|shortHash|message|author|email|date|timestamp
	const format = '%H|%h|%s|%an|%ae|%ar|%at';

	try {
		const output = execGit(projectPath, [
			'log',
			`--format=${format}`,
			`-n${limit}`,
			'--shortstat'
		]);

		if (!output) return [];

		const commits: GitCommit[] = [];
		const lines = output.split('\n');

		let i = 0;
		while (i < lines.length) {
			const line = lines[i];
			if (!line || !line.includes('|')) {
				i++;
				continue;
			}

			const parts = line.split('|');
			if (parts.length < 7) {
				i++;
				continue;
			}

			const [hash, shortHash, message, author, authorEmail, date, timestamp] = parts;

			// Parse the shortstat line (next non-empty line)
			let filesChanged = 0;
			let insertions = 0;
			let deletions = 0;

			i++;
			while (i < lines.length && !lines[i].includes('|')) {
				const statLine = lines[i].trim();
				if (statLine.includes('file')) {
					const fileMatch = statLine.match(/(\d+) files? changed/);
					const insertMatch = statLine.match(/(\d+) insertions?/);
					const deleteMatch = statLine.match(/(\d+) deletions?/);

					if (fileMatch) filesChanged = parseInt(fileMatch[1]);
					if (insertMatch) insertions = parseInt(insertMatch[1]);
					if (deleteMatch) deletions = parseInt(deleteMatch[1]);
				}
				i++;
			}

			// Detect if this is a Claude commit
			const isClaude = authorEmail.includes('noreply@anthropic.com') ||
				author.toLowerCase().includes('claude') ||
				message.includes('Co-Authored-By: Claude');

			commits.push({
				hash,
				shortHash,
				message,
				author,
				authorEmail,
				date,
				timestamp: parseInt(timestamp) * 1000,
				filesChanged,
				insertions,
				deletions,
				isClaude
			});
		}

		return commits;
	} catch (error) {
		console.error('[git-utils] Failed to get log:', error);
		return [];
	}
}

/**
 * Get list of branches
 */
export function getBranches(projectPath: string): GitBranch[] {
	const output = execGit(projectPath, ['branch', '-a', '--format=%(refname:short)|%(HEAD)|%(objectname:short)']);

	if (!output) return [];

	const branches: GitBranch[] = [];
	const lines = output.split('\n').filter(Boolean);

	for (const line of lines) {
		const [name, head, lastCommit] = line.split('|');

		// Skip HEAD pointer for remotes
		if (name.includes('HEAD')) continue;

		const isRemote = name.startsWith('origin/');
		const cleanName = isRemote ? name.replace('origin/', '') : name;

		// Don't duplicate if we already have the local branch
		if (isRemote && branches.some(b => b.name === cleanName && !b.isRemote)) {
			continue;
		}

		branches.push({
			name: cleanName,
			isCurrent: head === '*',
			isRemote,
			lastCommit
		});
	}

	return branches;
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(projectPath: string): string {
	return execGit(projectPath, ['branch', '--show-current']);
}

/**
 * Get diff for uncommitted changes or between commits
 */
export function getDiff(projectPath: string, commitHash?: string): GitDiff {
	let diffOutput: string;
	let statOutput: string;

	if (commitHash) {
		// Diff between commit and current HEAD
		diffOutput = execGit(projectPath, ['diff', commitHash, 'HEAD']);
		statOutput = execGit(projectPath, ['diff', commitHash, 'HEAD', '--stat']);
	} else {
		// Diff of uncommitted changes (staged + unstaged)
		diffOutput = execGit(projectPath, ['diff', 'HEAD']);
		statOutput = execGit(projectPath, ['diff', 'HEAD', '--stat']);
	}

	// Parse the stat output for summary
	const files: GitDiffFile[] = [];
	// For now, return the raw diff - can parse further if needed

	return {
		files,
		summary: statOutput || 'No changes'
	};
}

/**
 * Stage all changes
 */
export function stageAll(projectPath: string): void {
	execGit(projectPath, ['add', '-A']);
}

/**
 * Stage specific files
 */
export function stageFiles(projectPath: string, files: string[]): void {
	if (files.length === 0) return;
	execGit(projectPath, ['add', '--', ...files]);
}

/**
 * Create a commit (checkpoint)
 */
export function createCommit(projectPath: string, message: string): string {
	// Stage all changes first
	stageAll(projectPath);

	// Create the commit
	const output = execGit(projectPath, ['commit', '-m', message]);

	// Return the new commit hash
	return execGit(projectPath, ['rev-parse', 'HEAD']);
}

/**
 * Discard all uncommitted changes
 */
export function discardAllChanges(projectPath: string): void {
	// Reset staged changes
	execGit(projectPath, ['reset', 'HEAD']);
	// Discard unstaged changes
	execGit(projectPath, ['checkout', '--', '.']);
	// Remove untracked files
	execGit(projectPath, ['clean', '-fd']);
}

/**
 * Restore to a specific commit (destructive - force pushes)
 * Returns the commits that were undone
 */
export function restoreToCommit(
	projectPath: string,
	commitHash: string,
	options: { saveFirst?: boolean; commitMessage?: string } = {}
): { success: boolean; savedCommitHash?: string; error?: string } {
	try {
		let savedCommitHash: string | undefined;

		// If saveFirst is true, create a checkpoint of current state
		if (options.saveFirst) {
			const status = getStatus(projectPath);
			if (status.hasChanges) {
				const message = options.commitMessage || `Checkpoint before restore to ${commitHash.slice(0, 7)}`;
				savedCommitHash = createCommit(projectPath, message);
			}
		}

		// Hard reset to the target commit
		execGit(projectPath, ['reset', '--hard', commitHash]);

		// Force push to remote (if remote exists)
		try {
			const currentBranch = getCurrentBranch(projectPath);
			execGit(projectPath, ['push', '--force', 'origin', currentBranch]);
		} catch {
			// Remote might not exist or push might fail - that's okay for local-only repos
			console.log('[git-utils] Force push skipped (no remote or push failed)');
		}

		return { success: true, savedCommitHash };
	} catch (error: unknown) {
		const err = error as Error;
		return { success: false, error: err.message };
	}
}

/**
 * Switch to a different branch
 */
export function switchBranch(projectPath: string, branchName: string): { success: boolean; error?: string } {
	try {
		// Check for uncommitted changes first
		const status = getStatus(projectPath);
		if (status.hasChanges) {
			return {
				success: false,
				error: 'You have unsaved changes. Please save or discard them before switching workspaces.'
			};
		}

		execGit(projectPath, ['checkout', branchName]);
		return { success: true };
	} catch (error: unknown) {
		const err = error as Error;
		return { success: false, error: err.message };
	}
}

/**
 * Create a new branch from current HEAD
 */
export function createBranch(projectPath: string, branchName: string): { success: boolean; error?: string } {
	try {
		execGit(projectPath, ['checkout', '-b', branchName]);
		return { success: true };
	} catch (error: unknown) {
		const err = error as Error;
		return { success: false, error: err.message };
	}
}

/**
 * Push current branch to remote
 */
export function push(projectPath: string, force: boolean = false): { success: boolean; error?: string } {
	try {
		const currentBranch = getCurrentBranch(projectPath);
		const args = ['push', '-u', 'origin', currentBranch];
		if (force) args.splice(1, 0, '--force');

		execGit(projectPath, args);
		return { success: true };
	} catch (error: unknown) {
		const err = error as Error;
		return { success: false, error: err.message };
	}
}

/**
 * Get commits that would be undone if restoring to a specific commit
 */
export function getCommitsToUndo(projectPath: string, targetCommitHash: string): GitCommit[] {
	const allCommits = getLog(projectPath, 100);
	const commitsToUndo: GitCommit[] = [];

	for (const commit of allCommits) {
		if (commit.hash === targetCommitHash) break;
		commitsToUndo.push(commit);
	}

	return commitsToUndo;
}
