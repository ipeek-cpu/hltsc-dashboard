export interface Issue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  closed_at: string | null;
  close_reason: string;
  // Lifecycle fields for bead workflow enforcement
  branch_name?: string;
  agent_id?: string;
  commit_hash?: string;
  execution_log?: string;
  pr_url?: string;
  pr_status?: 'open' | 'merged' | 'closed';
  ci_status?: 'pending' | 'success' | 'failure';
}

export interface Dependency {
  issue_id: string;
  depends_on_id: string;
  type: 'blocks' | 'parent-child';
}

export interface BlockingRelation {
  source: string; // The blocker (this issue blocks the target)
  target: string; // The blocked issue (depends on source)
}

export interface Comment {
  id: number;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}

export interface IssueWithDetails extends Issue {
  blockers: Issue[];
  blocked_by: Issue[];
  children: Issue[];
  parent: Issue | null;
  comments: Comment[];
  events: Event[];
  childBlockingRelations?: BlockingRelation[]; // For graph visualization
}

export interface Event {
  id: number;
  issue_id: string;
  event_type: string;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
}

export interface StreamMessage {
  type: 'init' | 'update' | 'waiting' | 'error';
  project?: ProjectInfo;
  issues: Issue[];
  events?: Event[];
  dataVersion: number;
  message?: string;
}

// Agent types for Claude Code agents
export interface AgentFrontmatter {
  name: string;
  description?: string;
  model?: string; // "opus", "sonnet", "haiku"
  color?: string; // "orange", "blue", "green", etc.
  mcpServers?: AgentMcpConfig; // MCP server configuration for this agent
  [key: string]: unknown;
}

export interface Agent {
  filename: string; // e.g., "n8n-workflows.md"
  filepath: string; // Full path to file
  frontmatter: AgentFrontmatter;
  content: string; // Markdown content after frontmatter
  rawContent: string; // Full file content for editing
  scope: 'global' | 'project'; // Whether agent is from global or project agents dir
}

export type BoardFilter =
  | { type: 'all' }
  | { type: 'agent'; name: string };

// MCP Server Configuration Types
export interface McpServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export type McpConfigScope = 'global' | 'project' | 'agent';

export interface McpServerWithScope {
  name: string;
  config: McpServerConfig;
  scope: McpConfigScope;
  source?: string; // File path or agent filename
}

// MCP Registry API Types
export interface McpRegistryPackage {
  registryType: 'npm' | 'pip' | 'docker' | string;
  identifier: string;
  version?: string;
  transport: { type: 'stdio' | 'sse' | 'streamable-http' };
  packageArguments?: string[];
  environmentVariables?: string[];
}

export interface McpRegistryServer {
  name: string;
  description: string;
  repository: {
    url: string;
    source: string;
    subfolder?: string;
  };
  version: string;
  packages: McpRegistryPackage[];
}

export interface McpRegistryResult {
  server: McpRegistryServer;
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: 'active' | 'inactive';
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
  };
}

export interface McpRegistrySearchResponse {
  servers: McpRegistryResult[];
  metadata: {
    count: number;
    nextCursor?: string;
  };
}

// Agent MCP Configuration
export interface AgentMcpConfig {
  enabled?: string[];   // Server names to enable (from global/project)
  disabled?: string[];  // Server names to disable
  custom?: Record<string, McpServerConfig>;  // Agent-specific servers
}

// Task Runner types
export type TaskRunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TaskRunMode = 'autonomous' | 'guided';

export interface TaskRunEvent {
  id: string;
  timestamp: Date;
  type: 'status_change' | 'output' | 'tool_use' | 'tool_result' | 'error' | 'completion_signal';
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
}

export interface EpicSequence {
  totalTasks: number;
  currentIndex: number;
  taskIds: string[];
  completedTaskIds: string[];
  failedTaskIds: string[];
}

export interface TaskRun {
  id: string;
  projectId: string;
  issueId: string;
  issueTitle: string;
  issueType: string;
  mode: TaskRunMode;
  status: TaskRunStatus;

  // Epic context (undefined for single tasks)
  epicSequence?: EpicSequence;

  // Execution tracking
  startedAt: Date;
  completedAt?: Date;
  lastActivityAt: Date;
  events: TaskRunEvent[];

  // Claude session reference
  claudeSessionId?: string;

  // State flags
  awaitingUserInput: boolean;
  completionReason?: string;
}
