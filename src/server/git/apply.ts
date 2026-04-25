import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ApplyResult, Command } from '../../shared/types.ts';
import { listWorktrees } from './worktrees.ts';

const execFileAsync = promisify(execFile);

interface ApplyOpts {
  /** Repo path (the main worktree). */
  repoPath: string;
}

async function findWorktreeForBranch(
  repoPath: string,
  branch: string,
): Promise<string> {
  // Operations that modify a checked-out branch must run in that branch's
  // worktree (git refuses otherwise). Fall back to the main worktree when
  // the branch is not checked out anywhere — git can still update it via
  // `--detach` style operations, but for safety we surface this as an error.
  const wts = await listWorktrees(repoPath);
  const match = wts.find((w) => w.branch === branch);
  if (!match) {
    throw new Error(
      `Branch "${branch}" is not checked out in any worktree. Cannot run mutating commands on it from branchcraft yet.`,
    );
  }
  return match.path;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  // Surface stderr too — git uses it for non-error messages like push output.
  return [stdout, stderr].filter(Boolean).join('').trim();
}

async function execCommand(
  cmd: Command,
  opts: ApplyOpts,
): Promise<{ output: string }> {
  switch (cmd.kind) {
    case 'merge': {
      const cwd = await findWorktreeForBranch(opts.repoPath, cmd.into);
      const args = ['merge'];
      if (cmd.ff === 'only') args.push('--ff-only');
      else if (cmd.ff === 'no') args.push('--no-ff');
      args.push(cmd.from);
      return { output: await runGit(cwd, args) };
    }
    case 'rebase': {
      const cwd = await findWorktreeForBranch(opts.repoPath, cmd.branch);
      const args = ['rebase', String(cmd.onto)];
      return { output: await runGit(cwd, args) };
    }
    case 'cherry-pick': {
      const cwd = await findWorktreeForBranch(opts.repoPath, cmd.onto);
      const args = ['cherry-pick', ...cmd.commits];
      return { output: await runGit(cwd, args) };
    }
    case 'reset': {
      const cwd = await findWorktreeForBranch(opts.repoPath, cmd.branch);
      const mode = cmd.mode ?? 'mixed';
      const args = ['reset', `--${mode}`, String(cmd.to)];
      return { output: await runGit(cwd, args) };
    }
    case 'push': {
      const cwd = await findWorktreeForBranch(opts.repoPath, cmd.branch);
      const args = ['push', cmd.remote ?? 'origin', cmd.branch];
      if (cmd.force === 'lease') args.push('--force-with-lease');
      else if (cmd.force === true) args.push('--force');
      return { output: await runGit(cwd, args) };
    }
  }
}

/**
 * Run a queue of commands sequentially against a real repo. Stops on the
 * first failure so a half-applied queue is easier to recover from than one
 * that pushes through every error. Each result reports the command back so
 * the UI can pair output to the queue item that produced it.
 */
export async function applyCommands(
  commands: Command[],
  opts: ApplyOpts,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const cmd of commands) {
    try {
      const { output } = await execCommand(cmd, opts);
      results.push({ ok: true, command: cmd, output });
    } catch (e) {
      const err = e as { message?: string; stderr?: string; stdout?: string };
      const error = (err.stderr || err.message || String(e)).toString().trim();
      results.push({
        ok: false,
        command: cmd,
        error,
        ...(err.stdout ? { output: err.stdout.toString() } : {}),
      });
      break;
    }
  }
  return results;
}
