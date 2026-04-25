#!/usr/bin/env node
// branchcraft CLI entry point.
// Resolves to the bundled server in dist/server/index.js.
// Pre-MVP: also supports running from a checkout via `npm run dev`.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const builtServer = resolve(root, 'dist/server/index.js');

if (!existsSync(builtServer)) {
  console.error(
    'branchcraft: built server not found at dist/server/index.js.\n' +
    'If you are running from a source checkout, use `npm run dev` instead of the bin script.\n' +
    'Otherwise, please reinstall the package.'
  );
  process.exit(1);
}

const cwd = process.cwd();
const args = process.argv.slice(2);

const child = spawn(process.execPath, [builtServer, ...args], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, BRANCHCRAFT_INVOKED_FROM: cwd },
});

child.on('exit', (code) => process.exit(code ?? 0));
