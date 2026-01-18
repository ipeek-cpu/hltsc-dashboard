import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AgentFrontmatter } from './types';

/**
 * Parse YAML frontmatter from markdown content
 * Returns the frontmatter object and the remaining content
 */
export function parseFrontmatter(rawContent: string): {
	frontmatter: AgentFrontmatter;
	content: string;
} {
	const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
	const match = rawContent.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: { name: 'Unnamed Agent' },
			content: rawContent.trim()
		};
	}

	const yamlContent = match[1];
	const markdownContent = match[2];

	try {
		const parsed = parseYaml(yamlContent) as AgentFrontmatter;
		return {
			frontmatter: {
				...parsed,
				name: parsed.name || 'Unnamed Agent'
			},
			content: markdownContent.trim()
		};
	} catch (e) {
		console.error('Failed to parse YAML frontmatter:', e);
		return {
			frontmatter: { name: 'Unnamed Agent' },
			content: rawContent.trim()
		};
	}
}

/**
 * Serialize agent frontmatter and content back to markdown
 */
export function serializeAgent(frontmatter: AgentFrontmatter, content: string): string {
	const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trim();
	return `---\n${yaml}\n---\n\n${content}`;
}

/**
 * Color mapping for agent cards
 */
export const agentColors: Record<string, string> = {
	orange: '#f97316',
	blue: '#3b82f6',
	green: '#22c55e',
	purple: '#a855f7',
	red: '#ef4444',
	yellow: '#eab308',
	pink: '#ec4899',
	cyan: '#06b6d4',
	gray: '#6b7280'
};

/**
 * Model badge styles
 */
export const modelStyles: Record<string, { label: string; bg: string; color: string }> = {
	opus: { label: 'Opus', bg: '#fef3c7', color: '#d97706' },
	sonnet: { label: 'Sonnet', bg: '#dbeafe', color: '#2563eb' },
	haiku: { label: 'Haiku', bg: '#d1fae5', color: '#059669' }
};

/**
 * Get color hex value for an agent
 */
export function getAgentColor(colorName: string | undefined): string {
	return agentColors[colorName || 'gray'] || agentColors.gray;
}

/**
 * Get model style for an agent
 */
export function getModelStyle(modelName: string | undefined): { label: string; bg: string; color: string } {
	const model = modelName?.toLowerCase() || 'sonnet';
	return modelStyles[model] || modelStyles.sonnet;
}
