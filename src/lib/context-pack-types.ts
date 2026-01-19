/**
 * Context Pack Types
 *
 * Context Packs are structured bundles of code context designed to be
 * injected into Claude sessions. They capture the relevant code, types,
 * and documentation needed to understand a specific area of the codebase.
 *
 * Generation methods:
 * - codegraph: Generated via CodeGraph MCP queries
 * - heuristic: Generated via file pattern matching and grep
 * - manual: Hand-curated by the user
 */

// ============================================================================
// Generation Method
// ============================================================================

/**
 * How the context pack was generated
 */
export type GenerationMethod = 'codegraph' | 'heuristic' | 'manual';

/**
 * Relevance score for ranking context items
 * 1.0 = highly relevant (exact match, entry point)
 * 0.5 = moderately relevant (related symbol, dependency)
 * 0.0 = low relevance (tangentially related)
 */
export type RelevanceScore = number;

// ============================================================================
// Context File
// ============================================================================

/**
 * A file or file excerpt included in the context pack
 */
export interface ContextFile {
	/** Relative path from project root */
	path: string;

	/** File content (full or excerpt) */
	content: string;

	/** Programming language (for syntax highlighting) */
	language: string;

	/** Relevance score (0.0 - 1.0) */
	relevance: RelevanceScore;

	/** If excerpt, the line range included */
	excerpt?: {
		startLine: number;
		endLine: number;
		/** Original file total lines */
		totalLines: number;
	};

	/** Why this file was included */
	reason?: string;

	/** Estimated token count for this content */
	tokenEstimate: number;
}

// ============================================================================
// Context Symbol
// ============================================================================

/**
 * Symbol kind matching CodeGraph categories
 */
export type SymbolKind =
	| 'function'
	| 'method'
	| 'class'
	| 'interface'
	| 'type'
	| 'variable'
	| 'route'
	| 'component';

/**
 * A code symbol (function, class, type, etc.) in the context pack
 */
export interface ContextSymbol {
	/** Symbol name */
	name: string;

	/** Symbol kind */
	kind: SymbolKind;

	/** File path containing the symbol */
	filePath: string;

	/** Line number in file */
	line: number;

	/** Signature or declaration (for quick reference) */
	signature?: string;

	/** Full source code of the symbol */
	code?: string;

	/** Documentation/JSDoc if available */
	documentation?: string;

	/** Relevance score */
	relevance: RelevanceScore;

	/** Why this symbol was included */
	reason?: string;

	/** Estimated token count */
	tokenEstimate: number;
}

// ============================================================================
// Dependencies
// ============================================================================

/**
 * A dependency relationship between symbols
 */
export interface ContextDependency {
	/** Source symbol (caller) */
	from: string;

	/** Target symbol (callee) */
	to: string;

	/** Type of dependency */
	type: 'calls' | 'imports' | 'extends' | 'implements' | 'uses';

	/** File containing the from symbol */
	fromFile: string;

	/** File containing the to symbol */
	toFile: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration used to generate the context pack
 */
export interface ContextPackConfig {
	/** Entry point for context generation (file, symbol, or query) */
	entryPoint: string;

	/** Maximum depth for dependency traversal */
	maxDepth: number;

	/** Maximum number of symbols to include */
	maxSymbols: number;

	/** Maximum total tokens */
	maxTokens: number;

	/** Include documentation/comments */
	includeDocumentation: boolean;

	/** Include test files */
	includeTests: boolean;

	/** File patterns to exclude */
	excludePatterns: string[];

	/** Additional keywords to search for */
	keywords?: string[];
}

/**
 * Default configuration for context pack generation
 */
export const DEFAULT_CONTEXT_PACK_CONFIG: ContextPackConfig = {
	entryPoint: '',
	maxDepth: 2,
	maxSymbols: 50,
	maxTokens: 50000,
	includeDocumentation: true,
	includeTests: false,
	excludePatterns: [
		'**/node_modules/**',
		'**/.git/**',
		'**/dist/**',
		'**/build/**',
		'**/*.min.js',
		'**/*.map'
	]
};

// ============================================================================
// Context Pack
// ============================================================================

/**
 * Complete context pack ready for injection
 */
export interface ContextPack {
	/** Unique identifier */
	id: string;

	/** Human-readable name */
	name: string;

	/** Description of what this context covers */
	description?: string;

	/** Project this pack belongs to */
	projectId: string;

	/** How the pack was generated */
	generationMethod: GenerationMethod;

	/** Configuration used to generate */
	config: ContextPackConfig;

	/** Files included in the pack */
	files: ContextFile[];

	/** Symbols extracted from files */
	symbols: ContextSymbol[];

	/** Dependencies between symbols */
	dependencies: ContextDependency[];

	/** Timestamps */
	createdAt: string;
	updatedAt: string;

	/** Total estimated tokens */
	totalTokens: number;

	/** Generation metadata */
	metadata: {
		/** Time taken to generate (ms) */
		generationTimeMs: number;

		/** CodeGraph status at generation time */
		codegraphAvailable: boolean;

		/** Number of CodeGraph queries made */
		codegraphQueries: number;

		/** Any warnings during generation */
		warnings: string[];
	};
}

// ============================================================================
// Context Pack Summary
// ============================================================================

/**
 * Lightweight summary for listing context packs
 */
export interface ContextPackSummary {
	id: string;
	name: string;
	projectId: string;
	generationMethod: GenerationMethod;
	fileCount: number;
	symbolCount: number;
	totalTokens: number;
	createdAt: string;
	updatedAt: string;
}

// ============================================================================
// Generation Request
// ============================================================================

/**
 * Request to generate a new context pack
 */
export interface ContextPackRequest {
	/** Name for the generated pack */
	name: string;

	/** Entry point: file path, symbol name, or natural language query */
	entryPoint: string;

	/** Type of entry point */
	entryPointType: 'file' | 'symbol' | 'query';

	/** Optional configuration overrides */
	config?: Partial<ContextPackConfig>;

	/** Optional description */
	description?: string;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Rough token estimation (4 chars per token average)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens for a context pack
 */
export function calculatePackTokens(pack: Partial<ContextPack>): number {
	let total = 0;

	if (pack.files) {
		total += pack.files.reduce((sum, f) => sum + f.tokenEstimate, 0);
	}

	if (pack.symbols) {
		total += pack.symbols.reduce((sum, s) => sum + s.tokenEstimate, 0);
	}

	return total;
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Convert context pack to markdown for injection
 */
export function packToMarkdown(pack: ContextPack): string {
	const lines: string[] = [];

	lines.push(`# Context Pack: ${pack.name}`);
	if (pack.description) {
		lines.push(`\n${pack.description}`);
	}
	lines.push(`\n*Generated via ${pack.generationMethod} | ${pack.totalTokens} tokens*\n`);

	// Symbols section
	if (pack.symbols.length > 0) {
		lines.push('## Key Symbols\n');
		for (const symbol of pack.symbols.slice(0, 20)) {
			lines.push(`### ${symbol.kind}: ${symbol.name}`);
			lines.push(`*${symbol.filePath}:${symbol.line}*`);
			if (symbol.signature) {
				lines.push(`\`\`\`${getLanguageFromPath(symbol.filePath)}`);
				lines.push(symbol.signature);
				lines.push('```');
			}
			if (symbol.code) {
				lines.push(`\`\`\`${getLanguageFromPath(symbol.filePath)}`);
				lines.push(symbol.code);
				lines.push('```');
			}
			lines.push('');
		}
	}

	// Files section (excerpts only)
	if (pack.files.length > 0) {
		lines.push('## Relevant Files\n');
		for (const file of pack.files.slice(0, 10)) {
			lines.push(`### ${file.path}`);
			if (file.reason) {
				lines.push(`*${file.reason}*`);
			}
			if (file.excerpt) {
				lines.push(`Lines ${file.excerpt.startLine}-${file.excerpt.endLine} of ${file.excerpt.totalLines}`);
			}
			lines.push(`\`\`\`${file.language}`);
			lines.push(file.content);
			lines.push('```\n');
		}
	}

	return lines.join('\n');
}

/**
 * Get language identifier from file path
 */
function getLanguageFromPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase();
	const langMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		svelte: 'svelte',
		css: 'css',
		scss: 'scss',
		json: 'json',
		md: 'markdown',
		py: 'python',
		rs: 'rust',
		go: 'go'
	};
	return langMap[ext || ''] || ext || 'text';
}
