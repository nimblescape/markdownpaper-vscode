// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The clones of `mp get` ([R-CLI-004](../../docs/requirements.md#r-cli-004),
 * [decision 57](../../docs/requirements.md#decisions)): Git clones each repository that a paper names into
 * `.markdownpaper/repos/<name>/` of the project and checks out the rev of its reference. A reference to a branch gets
 * the local branch that follows the branch of GitHub, so that the author can commit and push in the clone; a reference
 * to a tag or a commit pins a version and gets it without a branch (a detached HEAD). Git runs with the access of the
 * author: its sign-in, or in CI the token of `GITHUB_TOKEN` or `GH_TOKEN`.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RemoteSpec } from '../paper/gallery';
import { newestTag } from '../paper/references';

/** Git runs the program git with arguments in a folder and returns its standard output. */
export type Git = (args: readonly string[], cwd: string) => Promise<string>;

/** GitError is a failure of Git, with the last line of its message. */
export class GitError extends Error {}

/**
 * gitOf returns the runner of Git. A token of GitHub in the environment goes to Git as the header of the requests to
 * github.com, for private repositories in CI. Without a terminal, Git asks for no password.
 * @param env - The environment.
 * @param interactive - Whether a person can answer the questions of Git in the terminal.
 */
export function gitOf(env: NodeJS.ProcessEnv = process.env, interactive = Boolean(process.stdin.isTTY)): Git {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const config = token ? ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`] : [];
  const environment = { ...env, ...(interactive ? {} : { GIT_TERMINAL_PROMPT: '0' }) };
  return (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile('git', [...config, ...args], { cwd, env: environment, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
        } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new GitError('Git is not installed, and mp get needs it: https://git-scm.com/downloads'));
        } else {
          const lines = String(stderr).trim().split(/\r?\n/).filter((line) => !line.startsWith('warning:') && !line.startsWith('hint:'));
          reject(new GitError(`git ${args[0]}: ${lines.pop() || error.message}`));
        }
      });
    });
}

/**
 * repositoryUrl returns the address of a repository on GitHub, which Git clones.
 * @param repository - The owner and the name of the repository.
 */
export const repositoryUrl = (repository: string): string => `https://github.com/${repository}.git`;

/** Got is the result of `getClone`: the checked out commit, the rev and its kind, and the commit before. */
export interface Got {
  commit: string;
  /** rev is the rev of the checkout: the rev of the reference, or with `newest` the newer tag. */
  rev: string;
  kind: 'branch' | 'tag' | 'commit';
  /** before is the commit of the clone before, and undefined for a new clone. */
  before?: string;
  /** kept is the reason why the clone stays as it is: work of the author that is not committed or not pushed. */
  kept?: string;
}

/**
 * commitOf returns the commit of a rev in a clone, or undefined when the clone does not have it.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 * @param rev - The rev.
 */
async function commitOf(git: Git, folder: string, rev: string): Promise<string | undefined> {
  try {
    return (await git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], folder)).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * defaultBranch returns the default branch of the repository of a clone.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 */
async function defaultBranch(git: Git, folder: string): Promise<string> {
  const head = async (): Promise<string> => (await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], folder)).trim().replace(/^origin\//, '');
  try {
    return await head();
  } catch {
    await git(['remote', 'set-head', 'origin', '--auto'], folder);
    return head();
  }
}

/**
 * unpushed counts the commits of local branches of a clone that no branch or tag of GitHub has: the commits that the
 * author has not pushed.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 * @param branches - The local branches.
 */
async function unpushed(git: Git, folder: string, branches: readonly string[]): Promise<number> {
  if (branches.length === 0) {
    return 0;
  }
  const count = await git(['rev-list', '--count', ...branches.map((branch) => `refs/heads/${branch}`), '--not', '--remotes=origin', '--tags'], folder);
  return Number.parseInt(count.trim(), 10) || 0;
}

/**
 * currentBranch returns the local branch that the clone has checked out, or '' for a detached HEAD.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 */
async function currentBranch(git: Git, folder: string): Promise<string> {
  try {
    return (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], folder)).trim();
  } catch {
    return '';
  }
}

/**
 * getClone clones a repository into a folder, or fetches into the clone that is there, and checks out the rev of a
 * reference ([decision 57](../../docs/requirements.md#decisions)). The head of a branch goes into the local branch of
 * the same name, which follows the branch of GitHub: a new clone gets it, and a clone that has it takes the new
 * commits only with a fast-forward. A tag or a commit is checked out without a branch; a clone at its tag or commit
 * needs no fetch. A clone with changes of its files that are not committed, or with commits of a local branch that
 * are not pushed, stays as it is, and `kept` says why.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 * @param spec - The reference; without a rev, the default branch.
 * @param options - `newest` moves a reference to a tag to the newest tag of a release.
 */
export async function getClone(git: Git, folder: string, spec: RemoteSpec, options: { newest?: boolean } = {}): Promise<Got> {
  const url = repositoryUrl(spec.repository);
  let before: string | undefined;
  let changed = false;
  const cloned = !fs.existsSync(path.join(folder, '.git'));
  if (!cloned) {
    const origin = (await git(['config', '--get', 'remote.origin.url'], folder)).trim();
    if (origin.replace(/\.git$/, '').toLowerCase() !== url.replace(/\.git$/, '').toLowerCase()) {
      throw new GitError(`The folder ${folder} is a clone of ${origin}, not of ${spec.repository}.`);
    }
    // A clone that was never checked out has only its folder .git.
    if (fs.readdirSync(folder).some((entry) => entry !== '.git')) {
      before = await commitOf(git, folder, 'HEAD');
      changed = (await git(['status', '--porcelain', '--untracked-files=no'], folder)).trim() !== '';
    }
  } else {
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    await git(['clone', '--quiet', '--no-checkout', '--filter=blob:none', url, folder], path.dirname(folder));
  }
  const rev = spec.ref ?? (await defaultBranch(git, folder));
  if (before && !changed && !options.newest) {
    if (/^[0-9a-f]{7,40}$/i.test(rev) && before.startsWith(rev.toLowerCase())) {
      return { commit: before, rev, kind: 'commit', before };
    }
    if ((await commitOf(git, folder, `refs/tags/${rev}`)) === before && !(await commitOf(git, folder, `refs/remotes/origin/${rev}`))) {
      return { commit: before, rev, kind: 'tag', before };
    }
  }
  if (!cloned) {
    await git(['fetch', '--quiet', '--prune', '--tags', '--force', 'origin'], folder);
  }
  let kind: Got['kind'];
  let target: string;
  if (await commitOf(git, folder, `refs/remotes/origin/${rev}`)) {
    kind = 'branch';
    target = `refs/remotes/origin/${rev}`;
  } else if (await commitOf(git, folder, `refs/tags/${rev}`)) {
    kind = 'tag';
    target = `refs/tags/${rev}`;
  } else if (/^[0-9a-f]{7,40}$/i.test(rev)) {
    if (!(await commitOf(git, folder, rev)) && rev.length === 40) {
      await git(['fetch', '--quiet', 'origin', rev], folder).catch(() => '');
    }
    if (!(await commitOf(git, folder, rev))) {
      throw new GitError(`${spec.repository} has no commit ${rev}.`);
    }
    kind = 'commit';
    target = rev;
  } else {
    throw new GitError(`${spec.repository} has no branch, tag or commit "${rev}".`);
  }
  let checkout = rev;
  if (options.newest && kind === 'tag') {
    const newer = newestTag((await git(['tag', '--list'], folder)).split(/\r?\n/).filter(Boolean), rev);
    if (newer) {
      checkout = newer;
      target = `refs/tags/${newer}`;
    }
  }
  const current = await currentBranch(git, folder);
  if (before) {
    // The work of the author in the clone stays: changes that are not committed, and commits that are not pushed of
    // the branch that is checked out or of the branch of the reference.
    const keep = (reason: string, advice: string): Got => ({ commit: before, rev: checkout, kind, before, kept: `The clone ${folder} ${reason}, so it stays as it is. ${advice}` });
    if (changed) {
      return keep(
        'has changes of its files that are not committed',
        kind === 'branch' ? 'Commit and push them in the window of the clone, then run mp get again.' : `The reference pins ${kind === 'tag' ? 'the tag' : 'the commit'} ${checkout}: remove the changes; a layout that the project changes belongs in layouts/.`,
      );
    }
    const local = kind === 'branch' && (await commitOf(git, folder, `refs/heads/${rev}`)) ? [rev] : [];
    const count = await unpushed(git, folder, [...new Set([current, ...local].filter(Boolean))]);
    if (count > 0) {
      return keep(`has ${count === 1 ? '1 commit' : `${count} commits`} that ${count === 1 ? 'is' : 'are'} not pushed`, 'Push them in the window of the clone, then run mp get again.');
    }
  }
  if (kind === 'branch' && before && current === rev) {
    await git(['merge', '--quiet', '--ff-only', target], folder);
  } else if (kind === 'branch') {
    // A new clone, a clone of another rev, or a clone without a branch from an older mp get.
    await git(['checkout', '--quiet', ...(before ? [] : ['--force']), '-B', rev, '--track', target], folder);
  } else {
    await git(['checkout', '--quiet', '--force', '--detach', `${target}^{commit}`], folder);
  }
  const commit = (await commitOf(git, folder, 'HEAD')) ?? '';
  return { commit, rev: checkout, kind, ...(before ? { before } : {}) };
}
