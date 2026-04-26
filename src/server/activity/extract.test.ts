import { describe, expect, it } from 'vitest';
import { extractActivityEvent } from './extract.ts';

const cwd = '/repo';

describe('extractActivityEvent', () => {
  it('returns null for non-message records', () => {
    expect(extractActivityEvent({ type: 'queue-operation' }, 'sid', cwd)).toBeNull();
    expect(extractActivityEvent({ type: 'custom-title' }, 'sid', cwd)).toBeNull();
  });

  it('extracts an Edit tool_use', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Edit',
            input: { file_path: '/repo/src/foo.ts', old_string: 'a', new_string: 'b' },
          },
        ],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e).toMatchObject({
      sessionId: 'sid',
      cwd,
      kind: 'edit',
      file: '/repo/src/foo.ts',
    });
    expect(e?.ts).toBeGreaterThan(0);
  });

  it('extracts a Write tool_use', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/repo/new.ts', content: 'x' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'write', file: '/repo/new.ts' });
  });

  it('extracts a Read', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/x.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'read', file: '/repo/x.ts' });
  });

  it('extracts a Bash with truncated label', () => {
    const long = 'a'.repeat(200);
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo ${long}` } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e?.kind).toBe('bash');
    expect(e?.label?.length).toBeLessThanOrEqual(60);
    expect(e?.file).toBeUndefined();
  });

  it('handles MultiEdit by reporting the file_path', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'MultiEdit', input: { file_path: '/repo/m.ts', edits: [] } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'edit', file: '/repo/m.ts' });
  });

  it('falls through to "other" for unknown tools', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e).toMatchObject({ kind: 'other', label: 'Glob' });
  });

  it('resolves relative file_path against cwd', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/rel.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', '/repo')).toMatchObject({
      file: '/repo/src/rel.ts',
    });
  });

  it('returns null for assistant messages with no tool_use', () => {
    const line = {
      type: 'message',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toBeNull();
  });

  it('returns null when timestamp is missing or unparseable', () => {
    const line = {
      type: 'message',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'x' } }] },
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toBeNull();
  });
});
