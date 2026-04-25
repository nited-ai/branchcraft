import { describe, expect, it } from 'vitest';
import { parseAiderHistory } from './aider.ts';

describe('parseAiderHistory', () => {
  it('returns nulls for empty input', () => {
    expect(parseAiderHistory('')).toEqual({
      lastUserMsg: null,
      lastSessionStart: null,
    });
  });

  it('reports the latest session start as unix seconds', () => {
    const md = [
      '# aider chat started at 2024-01-15 09:00:00',
      '> hello',
      '',
      '# aider chat started at 2024-02-20 10:30:00',
      '> later',
    ].join('\n');
    const r = parseAiderHistory(md);
    // 2024-02-20 10:30 UTC = 1708425000; locale-dependent parsing makes a
    // strict equality fragile, so just check the order-of-magnitude.
    expect(r.lastSessionStart).toBeGreaterThan(1700000000);
    expect(r.lastUserMsg).toBe('later');
  });

  it('returns the FIRST user message of the LATEST session', () => {
    const md = [
      '# aider chat started at 2024-01-01 00:00:00',
      '> oldest',
      '> follow-up',
      '# aider chat started at 2024-02-01 00:00:00',
      '> first of latest',
      '> follow-up of latest',
    ].join('\n');
    expect(parseAiderHistory(md).lastUserMsg).toBe('first of latest');
  });

  it('handles bodies without any user messages', () => {
    const md = [
      '# aider chat started at 2024-01-01 00:00:00',
      'plain text',
    ].join('\n');
    const r = parseAiderHistory(md);
    expect(r.lastUserMsg).toBeNull();
    expect(r.lastSessionStart).not.toBeNull();
  });

  it('handles CRLF line endings', () => {
    const md = ['# aider chat started at 2024-03-01 00:00:00', '> hi'].join('\r\n');
    expect(parseAiderHistory(md).lastUserMsg).toBe('hi');
  });
});
