import { describe, expect, it } from 'vitest';
import { encodeProjectKey, extractTitle } from './claude-code.ts';

describe('encodeProjectKey', () => {
  it('matches the real-world Windows encoding', () => {
    // Verified live from ~/.claude/projects/ during Evening 3.
    expect(
      encodeProjectKey(
        'D:\\Git\\Repos\\branchcraft\\.claude\\worktrees\\clever-babbage-9445d9',
      ),
    ).toBe(
      'D--Git-Repos-branchcraft--claude-worktrees-clever-babbage-9445d9',
    );
  });

  it('treats forward and back slashes the same', () => {
    expect(encodeProjectKey('D:/Git/Repos/foo')).toBe('D--Git-Repos-foo');
  });

  it('replaces dots in path segments', () => {
    expect(encodeProjectKey('/a/.git/refs')).toBe('-a--git-refs');
  });

  it('encodes drive-letter colons as a single dash', () => {
    expect(encodeProjectKey('C:/a/b')).toBe('C--a-b');
  });
});

describe('extractTitle', () => {
  it('prefers an explicit custom-title record', () => {
    const jsonl = [
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'first message' }),
      JSON.stringify({ type: 'custom-title', customTitle: 'Branchcraft init' }),
    ].join('\n');
    expect(extractTitle(jsonl)).toBe('Branchcraft init');
  });

  it('falls back to the first user message when no custom title', () => {
    const jsonl = [
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'Hello,\nworld' }),
      JSON.stringify({ type: 'message', role: 'assistant' }),
    ].join('\n');
    expect(extractTitle(jsonl)).toBe('Hello, world');
  });

  it('truncates long titles to 80 chars', () => {
    const long = 'a'.repeat(200);
    const jsonl = JSON.stringify({ type: 'custom-title', customTitle: long });
    expect(extractTitle(jsonl).length).toBe(80);
  });

  it('skips malformed JSON lines without throwing', () => {
    const jsonl = [
      'not json',
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'hi' }),
    ].join('\n');
    expect(extractTitle(jsonl)).toBe('hi');
  });

  it('returns a fallback for an empty transcript', () => {
    expect(extractTitle('')).toBe('Untitled session');
  });

  it('ignores non-enqueue queue ops and assistant messages', () => {
    const jsonl = [
      JSON.stringify({ type: 'queue-operation', operation: 'dequeue', content: 'noise' }),
      JSON.stringify({ type: 'message', role: 'assistant', content: 'answer' }),
    ].join('\n');
    expect(extractTitle(jsonl)).toBe('Untitled session');
  });
});
