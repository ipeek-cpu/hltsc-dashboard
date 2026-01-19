/**
 * Type definitions for session prompts
 */

export type PromptType = 'start' | 'end';

export interface PromptFrontmatter {
	name: string;
	type: PromptType;
	description?: string;
	enabled?: boolean;
}

export interface SessionPrompt {
	filename: string; // e.g., "session-start.md"
	filepath: string; // Full path to file
	frontmatter: PromptFrontmatter;
	content: string; // Markdown content after frontmatter
	rawContent: string; // Full file content for editing
	scope: 'global' | 'project'; // Whether prompt is from global or project prompts dir
}

export interface PromptsConfig {
	startPrompt?: SessionPrompt;
	endPrompt?: SessionPrompt;
	allPrompts: SessionPrompt[];
}

// Default prompt templates
export const DEFAULT_START_PROMPT = `---
name: Session Start
type: start
description: Initialize context when starting a session
enabled: true
---

# Session Start

Before we begin, please:

1. Check if there are any known issues or blockers I should be aware of
2. Review the current state of the project
3. Let me know what you'd like to work on today

I'm ready to help with your project.
`;

export const DEFAULT_END_PROMPT = `---
name: Session End
type: end
description: Wrap up session and preserve context
enabled: true
---

# Session Wrap Up

Before ending this session, please:

1. **Summarize** what we accomplished today
2. **List any known issues** that were discovered (CI failures, blockers, bugs)
3. **Document next steps** for the next session
4. **Note any decisions** made during this session

This will help maintain context for future sessions.
`;
