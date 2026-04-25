import { describe, expect, it } from 'vitest';
import { parseStatusPorcelainV2 } from './status.ts';

describe('parseStatusPorcelainV2', () => {
  it('parses a clean tracking branch', () => {
    const out = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +0 -0',
    ].join('\n');
    expect(parseStatusPorcelainV2(out)).toEqual({
      dirtyFiles: 0,
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
    });
  });

  it('counts ahead/behind from branch.ab', () => {
    const out = [
      '# branch.oid abc',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -3',
    ].join('\n');
    const r = parseStatusPorcelainV2(out);
    expect(r.ahead).toBe(2);
    expect(r.behind).toBe(3);
  });

  it('counts dirty files: changed, renamed, unmerged, untracked', () => {
    const out = [
      '# branch.oid abc',
      '# branch.head feature',
      '# branch.upstream origin/feature',
      '# branch.ab +0 -0',
      '1 .M N... 100644 100644 100644 a a src/file.ts',
      '1 M. N... 100644 100644 100644 b b src/staged.ts',
      '2 R. N... 100644 100644 100644 c c R100 newpath\toldpath',
      'u UU N... 100644 100644 100644 100644 d d d e conflict.ts',
      '? untracked.txt',
    ].join('\n');
    expect(parseStatusPorcelainV2(out).dirtyFiles).toBe(5);
  });

  it('returns null upstream when none set (detached or local-only branch)', () => {
    const out = ['# branch.oid abc', '# branch.head (detached)'].join('\n');
    const r = parseStatusPorcelainV2(out);
    expect(r.upstream).toBeNull();
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });

  it('handles CRLF', () => {
    const out =
      ['# branch.oid abc', '# branch.head main', '? new'].join('\r\n') + '\r\n';
    const r = parseStatusPorcelainV2(out);
    expect(r.dirtyFiles).toBe(1);
  });

  it('ignores empty input', () => {
    expect(parseStatusPorcelainV2('')).toEqual({
      dirtyFiles: 0,
      upstream: null,
      ahead: 0,
      behind: 0,
    });
  });
});
