#!/usr/bin/env node
// Spawn `tsx watch src/server/index.ts` and `vite` in parallel, inheriting
// stdio so stdout flushes immediately on Windows (concurrently has known
// line-buffering issues on Windows that swallow tsx watch output).

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    // Ignore stdin so children don't exit on EOF when run under a non-TTY
    // parent (e.g. preview servers that pipe stdio). stdout/stderr inherit
    // so output flushes immediately on Windows — see CLAUDE.md gotchas.
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    console.error(`[${label}] exited code=${code} signal=${signal}`);
    process.exit(code ?? 1);
  });
  child.on('error', (err) => {
    console.error(`[${label}] error: ${err.message}`);
    process.exit(1);
  });
  return child;
}

const server = run('server', 'npx', ['tsx', 'watch', 'src/server/index.ts']);
const web = run('web', 'npx', ['vite']);

const cleanup = () => {
  for (const c of [server, web]) {
    try {
      c.kill();
    } catch {
      // ignore — child may have already exited
    }
  }
};

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
