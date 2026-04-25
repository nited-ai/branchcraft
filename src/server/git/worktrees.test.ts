import { describe, expect, it } from 'vitest';
import { parseWorktreesPorcelain } from './worktrees.ts';

describe('parseWorktreesPorcelain', () => {
  it('parses a single main worktree on a branch', () => {
    const out = [
      'worktree /Users/dev/projects/foo',
      'HEAD abc123def456abc123def456abc123def456abcd',
      'branch refs/heads/main',
      '',
    ].join('\n');

    const result = parseWorktreesPorcelain(out);
    expect(result).toEqual([
      {
        path: '/Users/dev/projects/foo',
        head: 'abc123def456abc123def456abc123def456abcd',
        branch: 'main',
        isMain: true,
        isLocked: false,
        isPrunable: false,
        sessions: [],
      },
    ]);
  });

  it('parses multiple worktrees and marks first as main', () => {
    const out = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.wt/feature',
      'HEAD bbbb',
      'branch refs/heads/feature',
      '',
      'worktree /repo/.wt/scratch',
      'HEAD cccc',
      'detached',
      '',
    ].join('\n');

    const result = parseWorktreesPorcelain(out);
    expect(result).toHaveLength(3);
    expect(result[0]?.isMain).toBe(true);
    expect(result[1]?.isMain).toBe(false);
    expect(result[2]?.isMain).toBe(false);
    expect(result[0]?.branch).toBe('main');
    expect(result[1]?.branch).toBe('feature');
    expect(result[2]?.branch).toBeNull();
  });

  it('detects locked and prunable flags', () => {
    const out = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.wt/locked-one',
      'HEAD bbbb',
      'branch refs/heads/x',
      'locked',
      '',
      'worktree /repo/.wt/zombie',
      'HEAD cccc',
      'branch refs/heads/y',
      'prunable',
      '',
    ].join('\n');

    const result = parseWorktreesPorcelain(out);
    expect(result[1]?.isLocked).toBe(true);
    expect(result[2]?.isPrunable).toBe(true);
  });

  it('ignores empty input', () => {
    expect(parseWorktreesPorcelain('')).toEqual([]);
    expect(parseWorktreesPorcelain('\n\n')).toEqual([]);
  });

  it('handles CRLF line endings (Windows git)', () => {
    const out = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
    ].join('\r\n');

    const result = parseWorktreesPorcelain(out);
    expect(result).toHaveLength(1);
    expect(result[0]?.branch).toBe('main');
  });
});
