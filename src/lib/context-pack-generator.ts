/**
 * Context Pack Generator
 *
 * Generates context packs from CodeGraph queries or heuristic fallbacks.
 * Orchestrates the collection of symbols, files, and dependencies into
 * a structured ContextPack ready for injection into Claude sessions.
 */

import { randomUUID } from 'crypto';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, extname } from 'path';
import type {
	ContextPack,
	ContextPackRequest,
	ContextPackConfig,
	ContextFile,
	ContextSymbol,
	ContextDependency,
	GenerationMethod,
	ContextPackSummary
} from './context-pack-types';
import {
	DEFAULT_CONTEXT_PACK_CONFIG,
	estimateTokens,
	calculatePackTokens
} from './context-pack-types';
import {
	CodeGraphClient,
	createCodeGraphClient,
	isCodeGraphAvailable,
	heuristicSymbolSearch
} from './codegraph-client';

// ============================================================================
// Generator Class
// ============================================================================

/**
 * Context Pack Generator
 */
export class ContextPackGenerator {
	private projectPath: string;
	private projectId: string;
	private codegraph: CodeGraphClient;
	private codegraphAvailable: boolean = false;

	constructor(projectPath: string, projectId: string) {
		this.projectPath = projectPath;
		this.projectId = projectId;
		this.codegraph = createCodeGraphClient(projectPath);
	}

	/**
	 * Initialize the generator (check CodeGraph availability)
	 */
	async init(): Promise<void> {
		const status = await this.codegraph.getStatus();
		this.codegraphAvailable = status.available && status.indexed;

		if (!this.codegraphAvailable && status.available) {
			// Try to sync if available but not indexed
			await this.codegraph.sync();
			const newStatus = await this.codegraph.getStatus();
			this.codegraphAvailable = newStatus.indexed;
		}
	}

	/**
	 * Generate a context pack from a request
	 */
	async generate(request: ContextPackRequest): Promise<ContextPack> {
		const startTime = Date.now();
		const config = { ...DEFAULT_CONTEXT_PACK_CONFIG, ...request.config, entryPoint: request.entryPoint };

		let symbols: ContextSymbol[] = [];
		let files: ContextFile[] = [];
		let dependencies: ContextDependency[] = [];
		let method: GenerationMethod = 'heuristic';
		let codegraphQueries = 0;
		const warnings: string[] = [];

		// Try CodeGraph first
		if (this.codegraphAvailable) {
			try {
				const result = await this.generateWithCodeGraph(request, config);
				symbols = result.symbols;
				files = result.files;
				dependencies = result.dependencies;
				method = 'codegraph';
				codegraphQueries = result.queries;
			} catch (error) {
				warnings.push(`CodeGraph failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
				// Fall through to heuristic
			}
		}

		// Fallback to heuristic if CodeGraph didn't produce results
		if (symbols.length === 0) {
			const result = await this.generateWithHeuristics(request, config);
			symbols = result.symbols;
			files = result.files;
			method = 'heuristic';
			if (this.codegraphAvailable) {
				warnings.push('CodeGraph returned no results, used heuristic fallback');
			}
		}

		// Trim to token budget
		const trimmed = this.trimToTokenBudget(symbols, files, config.maxTokens);
		symbols = trimmed.symbols;
		files = trimmed.files;

		const pack: ContextPack = {
			id: randomUUID(),
			name: request.name,
			description: request.description,
			projectId: this.projectId,
			generationMethod: method,
			config,
			files,
			symbols,
			dependencies,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			totalTokens: 0,
			metadata: {
				generationTimeMs: Date.now() - startTime,
				codegraphAvailable: this.codegraphAvailable,
				codegraphQueries,
				warnings
			}
		};

		pack.totalTokens = calculatePackTokens(pack);
		return pack;
	}

	/**
	 * Generate using CodeGraph
	 */
	private async generateWithCodeGraph(
		request: ContextPackRequest,
		config: ContextPackConfig
	): Promise<{
		symbols: ContextSymbol[];
		files: ContextFile[];
		dependencies: ContextDependency[];
		queries: number;
	}> {
		let queries = 0;
		const symbols: ContextSymbol[] = [];
		const files: ContextFile[] = [];
		const dependencies: ContextDependency[] = [];
		const seenSymbols = new Set<string>();
		const seenFiles = new Set<string>();

		// Build context for the entry point
		const context = await this.codegraph.buildContext(request.entryPoint, {
			maxNodes: config.maxSymbols,
			maxCode: Math.min(20, config.maxSymbols)
		});
		queries++;

		if (context) {
			// Convert context to symbols
			const contextSymbols = this.codegraph.contextToSymbols(context);
			for (const sym of contextSymbols) {
				const key = `${sym.filePath}:${sym.name}`;
				if (!seenSymbols.has(key)) {
					seenSymbols.add(key);
					symbols.push(sym);
				}
			}
		}

		// If entry point is a symbol, also get callers/callees
		if (request.entryPointType === 'symbol' && config.maxDepth > 0) {
			const callers = await this.codegraph.getCallers(request.entryPoint, 10);
			queries++;
			for (const caller of callers) {
				const key = `${caller.filePath}:${caller.name}`;
				if (!seenSymbols.has(key)) {
					seenSymbols.add(key);
					symbols.push({
						...caller,
						relevance: 0.6,
						reason: `Calls ${request.entryPoint}`,
						tokenEstimate: estimateTokens(caller.signature || caller.name)
					});
					dependencies.push({
						from: caller.name,
						to: request.entryPoint,
						type: 'calls',
						fromFile: caller.filePath,
						toFile: '' // Will be filled if we know it
					});
				}
			}

			const callees = await this.codegraph.getCallees(request.entryPoint, 10);
			queries++;
			for (const callee of callees) {
				const key = `${callee.filePath}:${callee.name}`;
				if (!seenSymbols.has(key)) {
					seenSymbols.add(key);
					symbols.push({
						...callee,
						relevance: 0.5,
						reason: `Called by ${request.entryPoint}`,
						tokenEstimate: estimateTokens(callee.signature || callee.name)
					});
					dependencies.push({
						from: request.entryPoint,
						to: callee.name,
						type: 'calls',
						fromFile: '',
						toFile: callee.filePath
					});
				}
			}
		}

		// Load file excerpts for symbols that have code
		for (const symbol of symbols) {
			if (!seenFiles.has(symbol.filePath) && symbol.code) {
				seenFiles.add(symbol.filePath);
				files.push({
					path: symbol.filePath,
					content: symbol.code,
					language: this.getLanguage(symbol.filePath),
					relevance: symbol.relevance,
					reason: `Contains ${symbol.name}`,
					tokenEstimate: symbol.tokenEstimate
				});
			}
		}

		return { symbols, files, dependencies, queries };
	}

	/**
	 * Generate using heuristics (grep, glob)
	 */
	private async generateWithHeuristics(
		request: ContextPackRequest,
		config: ContextPackConfig
	): Promise<{
		symbols: ContextSymbol[];
		files: ContextFile[];
	}> {
		const symbols: ContextSymbol[] = [];
		const files: ContextFile[] = [];

		if (request.entryPointType === 'file') {
			// Load the specific file
			const file = await this.loadFile(request.entryPoint, config);
			if (file) {
				files.push(file);
			}
		} else if (request.entryPointType === 'symbol') {
			// Search for the symbol
			const results = await heuristicSymbolSearch(
				this.projectPath,
				request.entryPoint,
				{ limit: config.maxSymbols }
			);

			for (const result of results) {
				symbols.push({
					...result,
					relevance: 0.8,
					reason: 'Heuristic match',
					tokenEstimate: estimateTokens(result.signature || result.name)
				});
			}
		} else {
			// Query: search for files and symbols matching keywords
			const keywords = request.entryPoint.split(/\s+/).filter(k => k.length > 2);

			for (const keyword of keywords.slice(0, 3)) {
				const results = await heuristicSymbolSearch(
					this.projectPath,
					keyword,
					{ limit: Math.floor(config.maxSymbols / keywords.length) }
				);

				for (const result of results) {
					symbols.push({
						...result,
						relevance: 0.6,
						reason: `Matches keyword: ${keyword}`,
						tokenEstimate: estimateTokens(result.signature || result.name)
					});
				}
			}

			// Also find related files
			const relatedFiles = await this.findRelatedFiles(keywords, config);
			files.push(...relatedFiles);
		}

		return { symbols, files };
	}

	/**
	 * Load a file as ContextFile
	 */
	private async loadFile(
		filePath: string,
		config: ContextPackConfig
	): Promise<ContextFile | null> {
		const fullPath = filePath.startsWith('/')
			? filePath
			: join(this.projectPath, filePath);

		if (!existsSync(fullPath)) {
			return null;
		}

		try {
			const content = await readFile(fullPath, 'utf-8');
			const lines = content.split('\n');
			const relativePath = relative(this.projectPath, fullPath);

			return {
				path: relativePath,
				content,
				language: this.getLanguage(filePath),
				relevance: 1.0,
				reason: 'Requested file',
				tokenEstimate: estimateTokens(content),
				excerpt: {
					startLine: 1,
					endLine: lines.length,
					totalLines: lines.length
				}
			};
		} catch {
			return null;
		}
	}

	/**
	 * Find files related to keywords using recursive directory scan
	 */
	private async findRelatedFiles(
		keywords: string[],
		config: ContextPackConfig
	): Promise<ContextFile[]> {
		const files: ContextFile[] = [];
		const seenPaths = new Set<string>();

		// Recursively find source files
		const sourceFiles = await this.findSourceFiles(join(this.projectPath, 'src'));

		for (const keyword of keywords) {
			const lowerKeyword = keyword.toLowerCase();
			const matches = sourceFiles.filter(f =>
				f.toLowerCase().includes(lowerKeyword)
			);

			for (const match of matches.slice(0, 3)) {
				if (!seenPaths.has(match)) {
					seenPaths.add(match);
					const file = await this.loadFile(match, config);
					if (file) {
						file.relevance = 0.5;
						file.reason = `Filename matches: ${keyword}`;
						files.push(file);
					}
				}
			}
		}

		return files.slice(0, 10);
	}

	/**
	 * Recursively find source files in a directory
	 */
	private async findSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
		if (!existsSync(dir)) {
			return files;
		}

		try {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
						await this.findSourceFiles(fullPath, files);
					}
				} else if (entry.isFile()) {
					const ext = extname(entry.name).toLowerCase();
					if (['.ts', '.tsx', '.js', '.jsx', '.svelte'].includes(ext)) {
						files.push(relative(this.projectPath, fullPath));
					}
				}
			}
		} catch {
			// Ignore directory read errors
		}

		return files;
	}

	/**
	 * Trim symbols and files to fit within token budget
	 */
	private trimToTokenBudget(
		symbols: ContextSymbol[],
		files: ContextFile[],
		maxTokens: number
	): { symbols: ContextSymbol[]; files: ContextFile[] } {
		// Sort by relevance (highest first)
		const sortedSymbols = [...symbols].sort((a, b) => b.relevance - a.relevance);
		const sortedFiles = [...files].sort((a, b) => b.relevance - a.relevance);

		const resultSymbols: ContextSymbol[] = [];
		const resultFiles: ContextFile[] = [];
		let totalTokens = 0;

		// Add symbols until we hit 70% of budget
		const symbolBudget = maxTokens * 0.7;
		for (const symbol of sortedSymbols) {
			if (totalTokens + symbol.tokenEstimate <= symbolBudget) {
				resultSymbols.push(symbol);
				totalTokens += symbol.tokenEstimate;
			}
		}

		// Add files with remaining budget
		for (const file of sortedFiles) {
			if (totalTokens + file.tokenEstimate <= maxTokens) {
				resultFiles.push(file);
				totalTokens += file.tokenEstimate;
			}
		}

		return { symbols: resultSymbols, files: resultFiles };
	}

	/**
	 * Get language from file extension
	 */
	private getLanguage(filePath: string): string {
		const ext = extname(filePath).slice(1).toLowerCase();
		const langMap: Record<string, string> = {
			ts: 'typescript',
			tsx: 'typescript',
			js: 'javascript',
			jsx: 'javascript',
			svelte: 'svelte',
			css: 'css',
			scss: 'scss',
			json: 'json',
			md: 'markdown'
		};
		return langMap[ext] || ext || 'text';
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a context pack generator for a project
 */
export async function createContextPackGenerator(
	projectPath: string,
	projectId: string
): Promise<ContextPackGenerator> {
	const generator = new ContextPackGenerator(projectPath, projectId);
	await generator.init();
	return generator;
}

/**
 * Quick context generation for a task
 */
export async function generateQuickContext(
	projectPath: string,
	projectId: string,
	task: string
): Promise<ContextPack> {
	const generator = await createContextPackGenerator(projectPath, projectId);
	return generator.generate({
		name: `Context: ${task.slice(0, 50)}`,
		entryPoint: task,
		entryPointType: 'query',
		description: `Auto-generated context for: ${task}`
	});
}

/**
 * Convert a context pack to a summary
 */
export function packToSummary(pack: ContextPack): ContextPackSummary {
	return {
		id: pack.id,
		name: pack.name,
		projectId: pack.projectId,
		generationMethod: pack.generationMethod,
		fileCount: pack.files.length,
		symbolCount: pack.symbols.length,
		totalTokens: pack.totalTokens,
		createdAt: pack.createdAt,
		updatedAt: pack.updatedAt
	};
}
