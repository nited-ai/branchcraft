import { describe, expect, it } from 'vitest';
import { parseDecoration, parseGitLog } from './log.ts';

const NUL = '\0';

function makeLine(
  sha: string,
  parents: string[],
  subject: string,
  decoration = '',
  ts = 1700000000,
  author = 'Dev',
  email = 'dev@example.com',
): string {
  return [sha, parents.join(' '), author, email, String(ts), subject, decoration].join(NUL);
}

describe('parseGitLog', () => {
  it('parses a single linear commit', () => {
    const out = makeLine('a'.repeat(40), [], 'initial commit') + '\n';
    const result = parseGitLog(out);
    expect(result).toEqual([
      {
        sha: 'a'.repeat(40),
        parents: [],
        author: 'Dev',
        authorEmail: 'dev@example.com',
        authorDate: 1700000000,
        subject: 'initial commit',
        refs: [],
      },
    ]);
  });

  it('parses parents and decoration', () => {
    const out =
      makeLine('cccc', ['bbbb'], 'feat: x', 'HEAD -> main, origin/main') +
      '\n' +
      makeLine('bbbb', ['aaaa'], 'fix: y') +
      '\n' +
      makeLine('aaaa', [], 'init', 'tag: v0.1') +
      '\n';
    const result = parseGitLog(out);
    expect(result).toHaveLength(3);
    expect(result[0]?.parents).toEqual(['bbbb']);
    expect(result[0]?.refs).toEqual([
      { kind: 'head', name: 'main' },
      { kind: 'branch', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
    ]);
    expect(result[2]?.refs).toEqual([{ kind: 'tag', name: 'v0.1' }]);
  });

  it('handles merge commits (multi-parent)', () => {
    const out = makeLine('mmmm', ['bbbb', 'aaaa'], "Merge branch 'feat'") + '\n';
    const result = parseGitLog(out);
    expect(result[0]?.parents).toEqual(['bbbb', 'aaaa']);
  });

  it('survives subjects with commas, tabs, NUL-safe', () => {
    const subject = 'feat(api): rate-limit, with header `X-Foo`';
    const out = makeLine('a'.repeat(40), [], subject) + '\n';
    const result = parseGitLog(out);
    expect(result[0]?.subject).toBe(subject);
  });

  it('handles CRLF output (Windows git)', () => {
    const out = makeLine('a'.repeat(40), [], 'x') + '\r\n';
    const result = parseGitLog(out);
    expect(result).toHaveLength(1);
  });

  it('skips malformed lines', () => {
    const out =
      'not-a-record\n' +
      makeLine('a'.repeat(40), [], 'ok') +
      '\n' +
      [
        'b'.repeat(40),
        '',
        'Dev',
        'dev@example.com',
        'NaN',
        'bad timestamp',
        '',
      ].join(NUL) +
      '\n';
    const result = parseGitLog(out);
    expect(result).toHaveLength(1);
    expect(result[0]?.sha).toBe('a'.repeat(40));
  });
});

describe('parseDecoration', () => {
  it('returns empty array for empty input', () => {
    expect(parseDecoration('')).toEqual([]);
    expect(parseDecoration('   ')).toEqual([]);
  });

  it('expands "HEAD -> main" into both head and branch refs', () => {
    expect(parseDecoration('HEAD -> main')).toEqual([
      { kind: 'head', name: 'main' },
      { kind: 'branch', name: 'main' },
    ]);
  });

  it('handles bare detached HEAD', () => {
    expect(parseDecoration('HEAD')).toEqual([{ kind: 'head', name: null }]);
  });

  it('classifies tags, remotes, branches, stash', () => {
    const r = parseDecoration('tag: v1.2, origin/main, feature/x, refs/stash');
    expect(r).toEqual([
      { kind: 'tag', name: 'v1.2' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'remote', name: 'feature/x' },
      { kind: 'stash', name: 'stash' },
    ]);
  });
});
