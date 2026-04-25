import { describe, expect, it } from 'vitest';
import {
  parseReflog,
  parseStashList,
  parseTagList,
} from './rucksacks.ts';

const NUL = '\0';

describe('parseStashList', () => {
  it('parses a single entry', () => {
    const line = ['abc123', 'WIP on main: hi', '1700000000'].join(NUL);
    expect(parseStashList(line + '\n')).toEqual([
      {
        index: 0,
        sha: 'abc123',
        message: 'WIP on main: hi',
        authorDate: 1700000000,
      },
    ]);
  });

  it('numbers entries 0..N in input order', () => {
    const lines = [
      ['a', 'one', '1'].join(NUL),
      ['b', 'two', '2'].join(NUL),
      ['c', 'three', '3'].join(NUL),
    ].join('\n');
    const r = parseStashList(lines);
    expect(r.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it('skips malformed lines', () => {
    const lines = [
      'just a sha',
      ['x', 'good', '5'].join(NUL),
      'truncated\0noTimestamp',
    ].join('\n');
    expect(parseStashList(lines)).toHaveLength(1);
  });

  it('handles empty / CRLF input', () => {
    expect(parseStashList('')).toEqual([]);
    expect(
      parseStashList(['a', 'msg', '1'].join(NUL) + '\r\n'),
    ).toHaveLength(1);
  });
});

describe('parseTagList', () => {
  it('parses lightweight + annotated tags', () => {
    const lines = [
      // annotated: contents:subject set
      ['v1.0', 'abc', 'release v1', '1700000000'].join(NUL),
      // lightweight: no message body but date present
      ['v0.9', 'def', '', '1690000000'].join(NUL),
    ].join('\n');
    const tags = parseTagList(lines);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({
      name: 'v1.0',
      sha: 'abc',
      message: 'release v1',
      date: 1700000000,
    });
    expect(tags[1]?.message).toBe('');
  });

  it('falls back to date 0 if unparseable', () => {
    const line = ['v1', 'abc', 'msg', 'NaN'].join(NUL);
    expect(parseTagList(line + '\n')[0]?.date).toBe(0);
  });
});

describe('parseReflog', () => {
  it('splits action from message', () => {
    const line = ['abc', 'commit: feat: add foo', '1700000000'].join(NUL);
    const r = parseReflog(line + '\n')[0]!;
    expect(r.action).toBe('commit');
    expect(r.message).toBe('feat: add foo');
  });

  it('handles compound actions like rebase -i (finish)', () => {
    const line = ['abc', 'rebase-i: finish', '1700000000'].join(NUL);
    const r = parseReflog(line + '\n')[0]!;
    expect(r.action).toBe('rebase-i');
  });

  it('preserves order with sequential indices', () => {
    const lines = [
      ['a', 'commit: x', '3'].join(NUL),
      ['b', 'reset: y', '2'].join(NUL),
      ['c', 'pull: z', '1'].join(NUL),
    ].join('\n');
    const r = parseReflog(lines);
    expect(r.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(r.map((e) => e.action)).toEqual(['commit', 'reset', 'pull']);
  });

  it('handles malformed reflog message gracefully', () => {
    const line = ['abc', 'no colon here', '1'].join(NUL);
    const r = parseReflog(line + '\n')[0]!;
    expect(r.action).toBe('no colon here');
  });
});
