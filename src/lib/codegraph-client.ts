/**
 * CodeGraph Client
 *
 * Interfaces with the CodeGraph CLI to provide code intelligence
 * for context pack generation. Falls back to heuristic methods
 * when CodeGraph is unavailable.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
	ContextSymbol,
	ContextFile,
	ContextDependency,
	SymbolKind,
	RelevanceScore
} from './context-pack-types';
import { estimateTokens } from './context-pack-types';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * CodeGraph status information
 */
export interface CodeGraphStatus {
	available: boolean;
	indexed: boolean;
	fileCount: number;
	symbolCount: number;
	lastIndexed?: string;
	error?: string;
}

/**
 * CodeGraph search result
 */
export interface CodeGraphSearchResult {
	name: string;
	kind: SymbolKind;
	filePath: string;
	line: number;
	signature?: string;
}

/**
 * CodeGraph context result (from context command)
 */
export interface CodeGraphContextResult {
	entryPoints: Array<{
		name: string;
		kind: string;
		filePath: string;
		line: number;
		signature?: string;
	}>;
	relatedSymbols: Array<{
		name: string;
		kind: string;
		filePath: string;
		line: number;
		signature?: string;
		code?: string;
	}>;
	codeBlocks: Array<{
		symbol: string;
		filePath: string;
		line: number;
		code: string;
	}>;
}

/**
 * Options for CodeGraph queries
 */
export interface CodeGraphQueryOptions {
	projectPath: string;
	maxNodes?: number;
	maxCode?: number;
	timeout?: number;
}

// ============================================================================
// CodeGraph Client
// ============================================================================

/**
 * Client for interacting with CodeGraph CLI
 */
export class CodeGraphClient {
	private projectPath: string;
	private timeout: number;

	constructor(projectPath: string, timeout: number = 30000) {
		this.projectPath = projectPath;
		this.timeout = timeout;
	}

	/**
	 * Check if CodeGraph is available and the project is indexed
	 */
	async getStatus(): Promise<CodeGraphStatus> {
		try {
			// Check if codegraph CLI exists
			const { stdout: whichResult } = await execAsync('which codegraph', {
				timeout: 5000
			});

			if (!whichResult.trim()) {
				return {
					available: false,
					indexed: false,
					fileCount: 0,
					symbolCount: 0,
					error: 'CodeGraph CLI not found'
				};
			}

			// Check project status
			const { stdout } = await execAsync(
				`codegraph status "${this.projectPath}" --json 2>/dev/null || echo '{}'`,
				{ timeout: this.timeout }
			);

			try {
				const status = JSON.parse(stdout.trim() || '{}');
				return {
					available: true,
					indexed: status.indexed ?? false,
					fileCount: status.files ?? 0,
					symbolCount: status.symbols ?? 0,
					lastIndexed: status.lastIndexed
				};
			} catch {
				// Status command might not support --json, try text parsing
				return {
					available: true,
					indexed: stdout.includes('indexed') || stdout.includes('files'),
					fileCount: 0,
					symbolCount: 0
				};
			}
		} catch (error) {
			return {
				available: false,
				indexed: false,
				fileCount: 0,
				symbolCount: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Sync the CodeGraph index
	 */
	async sync(): Promise<boolean> {
		try {
			await execAsync(`codegraph sync "${this.projectPath}"`, {
				timeout: this.timeout * 2
			});
			return true;
		} catch (error) {
			console.error('CodeGraph sync failed:', error);
			return false;
		}
	}

	/**
	 * Search for symbols by name
	 */
	async search(
		query: string,
		options: { kind?: SymbolKind; limit?: number } = {}
	): Promise<CodeGraphSearchResult[]> {
		try {
			const kindFlag = options.kind ? `--kind ${options.kind}` : '';
			const limitFlag = options.limit ? `--limit ${options.limit}` : '--limit 20';

			const { stdout } = await execAsync(
				`codegraph query "${query}" -p "${this.projectPath}" ${kindFlag} ${limitFlag} --json 2>/dev/null`,
				{ timeout: this.timeout }
			);

			const results = JSON.parse(stdout.trim() || '[]');
			return results.map((r: any) => ({
				name: r.name,
				kind: r.kind as SymbolKind,
				filePath: r.file || r.filePath,
				line: r.line,
				signature: r.signature
			}));
		} catch (error) {
			console.error('CodeGraph search failed:', error);
			return [];
		}
	}

	/**
	 * Build context for a task/query
	 */
	async buildContext(
		task: string,
		options: { maxNodes?: number; maxCode?: number } = {}
	): Promise<CodeGraphContextResult | null> {
		try {
			const maxNodes = options.maxNodes ?? 30;
			const maxCode = options.maxCode ?? 15;

			const { stdout } = await execAsync(
				`codegraph context "${task}" -p "${this.projectPath}" -n ${maxNodes} -c ${maxCode} -f json 2>/dev/null`,
				{ timeout: this.timeout * 2 }
			);

			return JSON.parse(stdout.trim());
		} catch (error) {
			console.error('CodeGraph context failed:', error);
			return null;
		}
	}

	/**
	 * Build context and return as markdown
	 */
	async buildContextMarkdown(
		task: string,
		options: { maxNodes?: number; maxCode?: number } = {}
	): Promise<string | null> {
		try {
			const maxNodes = options.maxNodes ?? 30;
			const maxCode = options.maxCode ?? 15;

			const { stdout } = await execAsync(
				`codegraph context "${task}" -p "${this.projectPath}" -n ${maxNodes} -c ${maxCode} 2>/dev/null`,
				{ timeout: this.timeout * 2 }
			);

			return stdout.trim();
		} catch (error) {
			console.error('CodeGraph context markdown failed:', error);
			return null;
		}
	}

	/**
	 * Get callers of a symbol
	 */
	async getCallers(
		symbolName: string,
		limit: number = 20
	): Promise<CodeGraphSearchResult[]> {
		try {
			// Use MCP-style query via CLI if available
			const { stdout } = await execAsync(
				`codegraph query "callers:${symbolName}" -p "${this.projectPath}" --limit ${limit} --json 2>/dev/null`,
				{ timeout: this.timeout }
			);

			const results = JSON.parse(stdout.trim() || '[]');
			return results.map((r: any) => ({
				name: r.name,
				kind: r.kind as SymbolKind,
				filePath: r.file || r.filePath,
				line: r.line,
				signature: r.signature
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get callees of a symbol
	 */
	async getCallees(
		symbolName: string,
		limit: number = 20
	): Promise<CodeGraphSearchResult[]> {
		try {
			const { stdout } = await execAsync(
				`codegraph query "callees:${symbolName}" -p "${this.projectPath}" --limit ${limit} --json 2>/dev/null`,
				{ timeout: this.timeout }
			);

			const results = JSON.parse(stdout.trim() || '[]');
			return results.map((r: any) => ({
				name: r.name,
				kind: r.kind as SymbolKind,
				filePath: r.file || r.filePath,
				line: r.line,
				signature: r.signature
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Convert CodeGraph results to ContextSymbols
	 */
	searchResultsToSymbols(
		results: CodeGraphSearchResult[],
		relevance: RelevanceScore = 0.8,
		reason?: string
	): ContextSymbol[] {
		return results.map(r => ({
			name: r.name,
			kind: r.kind,
			filePath: r.filePath,
			line: r.line,
			signature: r.signature,
			relevance,
			reason,
			tokenEstimate: estimateTokens(r.signature || r.name)
		}));
	}

	/**
	 * Convert CodeGraph context to ContextSymbols with code
	 */
	contextToSymbols(context: CodeGraphContextResult): ContextSymbol[] {
		const symbols: ContextSymbol[] = [];

		// Entry points are most relevant
		for (const entry of context.entryPoints) {
			symbols.push({
				name: entry.name,
				kind: entry.kind as SymbolKind,
				filePath: entry.filePath,
				line: entry.line,
				signature: entry.signature,
				relevance: 1.0,
				reason: 'Entry point',
				tokenEstimate: estimateTokens(entry.signature || entry.name)
			});
		}

		// Related symbols with code
		for (const rel of context.relatedSymbols) {
			symbols.push({
				name: rel.name,
				kind: rel.kind as SymbolKind,
				filePath: rel.filePath,
				line: rel.line,
				signature: rel.signature,
				code: rel.code,
				relevance: 0.7,
				reason: 'Related symbol',
				tokenEstimate: estimateTokens(rel.code || rel.signature || rel.name)
			});
		}

		// Code blocks (if not already included via related symbols)
		const includedSymbols = new Set(symbols.map(s => s.name));
		for (const block of context.codeBlocks) {
			if (!includedSymbols.has(block.symbol)) {
				symbols.push({
					name: block.symbol,
					kind: 'function', // Default, could be refined
					filePath: block.filePath,
					line: block.line,
					code: block.code,
					relevance: 0.6,
					reason: 'Code block',
					tokenEstimate: estimateTokens(block.code)
				});
			}
		}

		return symbols;
	}
}

// ============================================================================
// Fallback Heuristic Methods
// ============================================================================

/**
 * Heuristic symbol search when CodeGraph is unavailable
 * Uses grep/ripgrep to find symbol definitions
 */
export async function heuristicSymbolSearch(
	projectPath: string,
	query: string,
	options: { limit?: number } = {}
): Promise<CodeGraphSearchResult[]> {
	const limit = options.limit ?? 20;

	try {
		// Use ripgrep if available, fallback to grep
		const rgCommand = `rg -n --json "(function|class|interface|type|const|let|var)\\s+${query}" "${projectPath}" -g "*.ts" -g "*.tsx" -g "*.js" -g "*.svelte" 2>/dev/null | head -${limit * 2}`;

		const { stdout } = await execAsync(rgCommand, { timeout: 10000 });

		const results: CodeGraphSearchResult[] = [];
		const lines = stdout.trim().split('\n').filter(Boolean);

		for (const line of lines) {
			try {
				const match = JSON.parse(line);
				if (match.type === 'match') {
					const text = match.data.lines.text;
					const kind = inferKindFromText(text);
					results.push({
						name: query,
						kind,
						filePath: match.data.path.text,
						line: match.data.line_number
					});
				}
			} catch {
				// Skip unparseable lines
			}
		}

		return results.slice(0, limit);
	} catch {
		return [];
	}
}

/**
 * Infer symbol kind from source text
 */
function inferKindFromText(text: string): SymbolKind {
	if (text.includes('function ')) return 'function';
	if (text.includes('class ')) return 'class';
	if (text.includes('interface ')) return 'interface';
	if (text.includes('type ')) return 'type';
	if (text.includes('const ') || text.includes('let ') || text.includes('var '))
		return 'variable';
	return 'function';
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a CodeGraph client for a project
 */
export function createCodeGraphClient(
	projectPath: string,
	timeout?: number
): CodeGraphClient {
	return new CodeGraphClient(projectPath, timeout);
}

/**
 * Check if CodeGraph is available globally
 */
export async function isCodeGraphAvailable(): Promise<boolean> {
	try {
		const { stdout } = await execAsync('which codegraph', { timeout: 5000 });
		return !!stdout.trim();
	} catch {
		return false;
	}
}
