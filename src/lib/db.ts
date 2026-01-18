import Database from 'better-sqlite3';
import path from 'path';

const BEADS_DB_PATH = path.resolve(process.cwd(), '../.beads/beads.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(BEADS_DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

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

export interface Comment {
  id: number;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}

export function getAllIssues(): Issue[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE deleted_at IS NULL
    ORDER BY priority ASC, updated_at DESC
  `).all() as Issue[];
}

export function getIssuesByStatus(status: string): Issue[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE status = ? AND deleted_at IS NULL
    ORDER BY priority ASC, updated_at DESC
  `).all(status) as Issue[];
}

export function getIssueById(id: string): Issue | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, description, status, priority, issue_type,
           assignee, created_at, created_by, updated_at, closed_at, close_reason
    FROM issues
    WHERE id = ?
  `).get(id) as Issue | undefined;
}

export function getCommentsForIssue(issueId: string): Comment[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, issue_id, author, text, created_at
    FROM comments
    WHERE issue_id = ?
    ORDER BY created_at ASC
  `).all(issueId) as Comment[];
}

export function getRecentEvents(since?: string, limit = 100): Event[] {
  const db = getDb();
  if (since) {
    return db.prepare(`
      SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
      FROM events
      WHERE created_at > ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(since, limit) as Event[];
  }
  return db.prepare(`
    SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
    FROM events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Event[];
}

export function getDataVersion(): number {
  const db = getDb();
  const result = db.pragma('data_version', { simple: true });
  return result as number;
}

export function getIssueStats(): { status: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT status, COUNT(*) as count
    FROM issues
    WHERE deleted_at IS NULL
    GROUP BY status
  `).all() as { status: string; count: number }[];
}
