import { getProjectById } from '$lib/dashboard-db';
import { getManagedClaudePath, isInstalled } from '$lib/claude-code-manager';
import { getStoredToken } from '$lib/claude-auth';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

const INIT_PROMPT = `Analyze this codebase and create a CLAUDE.md file in the project root with:
1. Project overview and purpose
2. Key directories and their contents
3. Build/run commands (look for package.json, Makefile, etc.)
4. Code conventions and patterns used
5. Any important configuration files

Keep it concise but informative. If the project is empty or minimal, create a basic template.`;

/**
 * POST - Initialize Claude Code in this project
 * Uses print mode (-p) to create CLAUDE.md non-interactively
 */
export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return new Response('Project not found', { status: 404 });
	}

	// Check if Claude Code is installed
	if (!isInstalled()) {
		return new Response(JSON.stringify({ error: 'Claude Code is not installed' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const claudePath = getManagedClaudePath();
	let childProcess: ChildProcess | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (data: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			try {
				send({ type: 'status', status: 'Starting Claude Code initialization...' });

				// First, ensure .claude directory exists (this marks the project as "trusted")
				const claudeDir = path.join(project.path, '.claude');
				if (!fs.existsSync(claudeDir)) {
					fs.mkdirSync(claudeDir, { recursive: true });
					send({ type: 'text', content: 'Created .claude directory' });
				}

				// Use print mode with allowed tools to create CLAUDE.md
				const args = [
					'-p', INIT_PROMPT,
					'--output-format', 'stream-json',
					'--verbose',
					'--dangerously-skip-permissions'
				];

				send({ type: 'status', status: 'Analyzing codebase and creating CLAUDE.md...' });

				// Get stored OAuth token for authentication
				const oauthToken = getStoredToken();

				childProcess = spawn(claudePath, args, {
					cwd: project.path,
					env: {
						...process.env,
						CI: 'true', // Helps avoid interactive prompts
						// Use stored OAuth token if available
						...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {})
					},
					stdio: ['pipe', 'pipe', 'pipe']
				});

				// Close stdin
				childProcess.stdin?.end();

				let buffer = '';

				childProcess.stdout?.on('data', (data: Buffer) => {
					const text = data.toString();
					buffer += text;

					// Process complete lines
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) continue;

						try {
							const parsed = JSON.parse(line);

							// Extract content from assistant messages
							if (parsed.type === 'assistant' && parsed.message?.content) {
								for (const block of parsed.message.content) {
									if (block.type === 'text' && block.text) {
										send({ type: 'text', content: block.text });
									} else if (block.type === 'tool_use') {
										send({
											type: 'tool_use',
											tool: block.name,
											input: block.input || {}
										});
									}
								}
							} else if (parsed.type === 'content_block_delta') {
								// Handle streaming text deltas
								if (parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
									send({ type: 'text', content: parsed.delta.text });
								}
							} else if (parsed.type === 'tool_result' ||
								(parsed.type === 'user' && parsed.message?.content)) {
								// Handle tool results
								const content = parsed.message?.content || parsed.content;
								if (content) {
									for (const block of (Array.isArray(content) ? content : [content])) {
										if (block.type === 'tool_result') {
											const resultText = typeof block.content === 'string'
												? block.content
												: JSON.stringify(block.content);
											send({ type: 'tool_result', result: resultText });
										}
									}
								}
							} else if (parsed.type === 'result') {
								if (parsed.is_error) {
									send({ type: 'error', content: parsed.result || 'Unknown error' });
								}
							}
						} catch {
							// Not JSON, just output as-is
							if (line.trim()) {
								send({ type: 'text', content: line });
							}
						}
					}
				});

				childProcess.stderr?.on('data', (data: Buffer) => {
					const text = data.toString().trim();
					if (text && (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed'))) {
						send({ type: 'text', content: `[stderr] ${text}` });
					}
				});

				childProcess.on('close', (code) => {
					// Check if CLAUDE.md was created
					const claudeMd = path.join(project.path, 'CLAUDE.md');
					const hasClaudeMd = fs.existsSync(claudeMd);

					if (code === 0 || hasClaudeMd) {
						send({ type: 'done', content: 'Claude Code initialized successfully!' });
					} else {
						// Even if Claude command failed, we created .claude dir so it should be usable
						send({ type: 'done', content: 'Initialization complete (CLAUDE.md may need manual creation)' });
					}
					controller.close();
				});

				childProcess.on('error', (err) => {
					send({ type: 'error', content: `Failed to run Claude: ${err.message}` });
					controller.close();
				});

				// Timeout after 60 seconds
				setTimeout(() => {
					if (childProcess && !childProcess.killed) {
						send({ type: 'status', status: 'Timeout reached, finishing up...' });
						childProcess.kill('SIGTERM');
					}
				}, 60000);

			} catch (error) {
				send({ type: 'error', content: `Failed to start Claude: ${error instanceof Error ? error.message : 'Unknown error'}` });
				controller.close();
			}
		},
		cancel() {
			if (childProcess && !childProcess.killed) {
				childProcess.kill('SIGTERM');
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
