import type { Command } from '../shared/types.ts';

/**
 * One-line human-readable summary of a command. Used in the queue panel and
 * the apply confirm modal — short enough to fit in a single row, descriptive
 * enough to recognize what's about to run.
 */
export function commandSummary(cmd: Command): string {
  switch (cmd.kind) {
    case 'merge': {
      const ff = cmd.ff && cmd.ff !== 'auto' ? ` (--ff-${cmd.ff})` : '';
      return `merge ${cmd.from} → ${cmd.into}${ff}`;
    }
    case 'squash-merge':
      return `squash-merge ${cmd.from} → ${cmd.into}`;
    case 'rebase':
      return `rebase ${cmd.branch} onto ${cmd.onto}`;
    case 'cherry-pick': {
      const list = cmd.commits.map((c) => c.slice(0, 7)).join(' ');
      return `cherry-pick ${list} → ${cmd.onto}`;
    }
    case 'reset': {
      const mode = cmd.mode ?? 'mixed';
      const to = typeof cmd.to === 'string' ? cmd.to.slice(0, 7) : cmd.to;
      return `reset ${cmd.branch} --${mode} ${to}`;
    }
    case 'push': {
      const force =
        cmd.force === 'lease'
          ? ' --force-with-lease'
          : cmd.force
            ? ' --force'
            : '';
      return `push ${cmd.branch} → ${cmd.remote ?? 'origin'}${force}`;
    }
    case 'checkout': {
      const wt = cmd.worktree.split(/[/\\]/).filter(Boolean).at(-1) ?? cmd.worktree;
      const target =
        typeof cmd.target === 'string' && /^[0-9a-f]{4,40}$/i.test(cmd.target)
          ? cmd.target.slice(0, 7)
          : cmd.target;
      return `checkout ${target} in ${wt}`;
    }
  }
}

/** One-sentence description of what each command kind does — used by tooltips. */
export const COMMAND_BLURB: Record<Command['kind'], string> = {
  merge:
    'Combines another branch into this one. Fast-forwards if possible, otherwise creates a merge commit.',
  'squash-merge':
    'Combines another branch\'s history into a single new commit on this one — like merge, but with no merge link. The source branch is unchanged.',
  rebase:
    'Replays this branch’s commits on top of another, rewriting their SHAs. Linear history, but force-push needed if shared.',
  'cherry-pick':
    'Copies specific commits onto another branch. New SHAs, original commits stay where they were.',
  reset:
    'Moves a branch ref to a different commit. --hard discards working changes, --soft keeps them staged, --mixed (default) keeps them unstaged.',
  push:
    'Sends local commits to the remote. --force-with-lease only overwrites if the remote hasn’t changed since you last fetched.',
  checkout:
    'Switches a worktree to a branch or commit. Each worktree can be on a different branch — that’s how you run multiple AI agents in parallel without them interfering.',
};
