import * as nodePath from 'node:path';
import * as posixPath from 'node:path/posix';
import type { ActivityEvent, ActivityKind } from '../../shared/types.ts';

const KIND_BY_TOOL: Record<string, ActivityKind> = {
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'write',
  Read: 'read',
  NotebookRead: 'read',
  NotebookEdit: 'edit',
  Bash: 'bash',
};

/**
 * Map a parsed JSONL record (of the form CCD writes) to an ActivityEvent,
 * or null when the record is not a tool_use we want to surface.
 *
 * Pure — `cwd` is the absolute worktree path the session was started in,
 * used to resolve relative file_path inputs.
 */
export function extractActivityEvent(
  raw: unknown,
  sessionId: string,
  cwd: string,
): ActivityEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'message') return null;
  const msg = r.message;
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.role !== 'assistant') return null;
  const content = m.content;
  if (!Array.isArray(content)) return null;
  const ts = parseTs(r.timestamp);
  if (ts === null) return null;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type !== 'tool_use') continue;
    const name = typeof b.name === 'string' ? b.name : '';
    const input =
      typeof b.input === 'object' && b.input !== null
        ? (b.input as Record<string, unknown>)
        : {};
    const kind = KIND_BY_TOOL[name] ?? 'other';
    let file: string | undefined;
    let label: string | undefined;
    if (kind === 'edit' || kind === 'write' || kind === 'read') {
      const fp = typeof input.file_path === 'string' ? input.file_path : null;
      if (fp) file = resolveFilePath(cwd, fp);
    } else if (kind === 'bash') {
      const cmd = typeof input.command === 'string' ? input.command : '';
      label = cmd.replace(/\s+/g, ' ').slice(0, 60);
    } else {
      label = name || 'tool_use';
    }
    return {
      sessionId,
      cwd,
      ts,
      kind,
      ...(file !== undefined ? { file } : {}),
      ...(label !== undefined ? { label } : {}),
    };
  }
  return null;
}

/**
 * Resolve a file_path input against cwd, using POSIX semantics when cwd
 * starts with '/' (covers test fixtures and Linux/macOS production paths).
 * Falls back to native path resolution on Windows native paths.
 */
function resolveFilePath(cwd: string, fp: string): string {
  const p = cwd.startsWith('/') ? posixPath : nodePath;
  return p.isAbsolute(fp) ? fp : p.resolve(cwd, fp);
}

function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
