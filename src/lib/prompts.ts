/**
 * Session prompts management - load/parse/save prompts from .claude/prompts/
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
	SessionPrompt,
	PromptFrontmatter,
	PromptsConfig,
	PromptType
} from './prompt-types';
import {
	DEFAULT_START_PROMPT,
	DEFAULT_END_PROMPT
} from './prompt-types';

const PROMPTS_DIR = 'prompts';
const CLAUDE_DIR = '.claude';

/**
 * Get the prompts directory path for a project
 */
export function getProjectPromptsDir(projectPath: string): string {
	return path.join(projectPath, CLAUDE_DIR, PROMPTS_DIR);
}

/**
 * Get the global prompts directory path
 */
export function getGlobalPromptsDir(): string {
	return path.join(os.homedir(), CLAUDE_DIR, PROMPTS_DIR);
}

/**
 * Parse YAML frontmatter from prompt content
 */
export function parsePromptFrontmatter(rawContent: string): {
	frontmatter: PromptFrontmatter;
	content: string;
} {
	const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
	const match = rawContent.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: { name: 'Unnamed Prompt', type: 'start' },
			content: rawContent.trim()
		};
	}

	const yamlContent = match[1];
	const markdownContent = match[2];

	try {
		const parsed = parseYaml(yamlContent) as PromptFrontmatter;
		return {
			frontmatter: {
				...parsed,
				name: parsed.name || 'Unnamed Prompt',
				type: parsed.type || 'start',
				enabled: parsed.enabled !== false // Default to enabled
			},
			content: markdownContent.trim()
		};
	} catch (e) {
		console.error('Failed to parse prompt YAML frontmatter:', e);
		return {
			frontmatter: { name: 'Unnamed Prompt', type: 'start' },
			content: rawContent.trim()
		};
	}
}

/**
 * Serialize prompt frontmatter and content back to markdown
 */
export function serializePrompt(frontmatter: PromptFrontmatter, content: string): string {
	const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trim();
	return `---\n${yaml}\n---\n\n${content}`;
}

/**
 * Load all prompts from a directory
 */
export function loadPromptsFromDir(
	dirPath: string,
	scope: 'global' | 'project'
): SessionPrompt[] {
	const prompts: SessionPrompt[] = [];

	if (!fs.existsSync(dirPath)) {
		return prompts;
	}

	try {
		const files = fs.readdirSync(dirPath);

		for (const file of files) {
			if (!file.endsWith('.md')) continue;

			const filepath = path.join(dirPath, file);

			try {
				const stat = fs.statSync(filepath);
				if (!stat.isFile()) continue;

				const rawContent = fs.readFileSync(filepath, 'utf-8');
				const { frontmatter, content } = parsePromptFrontmatter(rawContent);

				prompts.push({
					filename: file,
					filepath,
					frontmatter,
					content,
					rawContent,
					scope
				});
			} catch (err) {
				console.error(`Error loading prompt ${file}:`, err);
			}
		}
	} catch (err) {
		console.error(`Error reading prompts directory ${dirPath}:`, err);
	}

	return prompts;
}

/**
 * Load all prompts for a project (project-level + global fallback)
 */
export function loadPrompts(projectPath: string): PromptsConfig {
	// Load project-level prompts first
	const projectPromptsDir = getProjectPromptsDir(projectPath);
	const projectPrompts = loadPromptsFromDir(projectPromptsDir, 'project');

	// Load global prompts
	const globalPromptsDir = getGlobalPromptsDir();
	const globalPrompts = loadPromptsFromDir(globalPromptsDir, 'global');

	// Combine all prompts (project takes precedence)
	const allPrompts = [...projectPrompts];

	// Add global prompts that don't have project-level overrides
	const projectFilenames = new Set(projectPrompts.map((p) => p.filename));
	for (const prompt of globalPrompts) {
		if (!projectFilenames.has(prompt.filename)) {
			allPrompts.push(prompt);
		}
	}

	// Find active start and end prompts
	const startPrompt = allPrompts.find(
		(p) => p.frontmatter.type === 'start' && p.frontmatter.enabled !== false
	);
	const endPrompt = allPrompts.find(
		(p) => p.frontmatter.type === 'end' && p.frontmatter.enabled !== false
	);

	return {
		startPrompt,
		endPrompt,
		allPrompts
	};
}

/**
 * Ensure prompts directory exists
 */
export function ensurePromptsDir(projectPath: string): string {
	const promptsDir = getProjectPromptsDir(projectPath);
	const claudeDir = path.join(projectPath, CLAUDE_DIR);

	if (!fs.existsSync(claudeDir)) {
		fs.mkdirSync(claudeDir, { recursive: true });
	}

	if (!fs.existsSync(promptsDir)) {
		fs.mkdirSync(promptsDir, { recursive: true });
	}

	return promptsDir;
}

/**
 * Create default prompts if they don't exist
 */
export function createDefaultPrompts(projectPath: string): void {
	const promptsDir = ensurePromptsDir(projectPath);

	const startPromptPath = path.join(promptsDir, 'session-start.md');
	if (!fs.existsSync(startPromptPath)) {
		fs.writeFileSync(startPromptPath, DEFAULT_START_PROMPT, 'utf-8');
	}

	const endPromptPath = path.join(promptsDir, 'session-end.md');
	if (!fs.existsSync(endPromptPath)) {
		fs.writeFileSync(endPromptPath, DEFAULT_END_PROMPT, 'utf-8');
	}
}

/**
 * Save a prompt to file
 */
export function savePrompt(
	projectPath: string,
	filename: string,
	content: string
): SessionPrompt {
	const promptsDir = ensurePromptsDir(projectPath);
	const filepath = path.join(promptsDir, filename);

	fs.writeFileSync(filepath, content, 'utf-8');

	const { frontmatter, content: markdownContent } = parsePromptFrontmatter(content);

	return {
		filename,
		filepath,
		frontmatter,
		content: markdownContent,
		rawContent: content,
		scope: 'project'
	};
}

/**
 * Delete a prompt file
 */
export function deletePrompt(projectPath: string, filename: string): boolean {
	const promptsDir = getProjectPromptsDir(projectPath);
	const filepath = path.join(promptsDir, filename);

	if (fs.existsSync(filepath)) {
		fs.unlinkSync(filepath);
		return true;
	}

	return false;
}

/**
 * Get a specific prompt by filename
 */
export function getPrompt(
	projectPath: string,
	filename: string
): SessionPrompt | null {
	const { allPrompts } = loadPrompts(projectPath);
	return allPrompts.find((p) => p.filename === filename) || null;
}

/**
 * Get the active start prompt content for injection
 */
export function getStartPromptContent(projectPath: string): string | null {
	const { startPrompt } = loadPrompts(projectPath);
	if (!startPrompt || startPrompt.frontmatter.enabled === false) {
		return null;
	}
	return startPrompt.content;
}

/**
 * Get the active end prompt content for injection
 */
export function getEndPromptContent(projectPath: string): string | null {
	const { endPrompt } = loadPrompts(projectPath);
	if (!endPrompt || endPrompt.frontmatter.enabled === false) {
		return null;
	}
	return endPrompt.content;
}

/**
 * Check if prompts directory exists for a project
 */
export function hasPromptsDir(projectPath: string): boolean {
	return fs.existsSync(getProjectPromptsDir(projectPath));
}
