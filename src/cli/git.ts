// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The clones of `mp get` ([R-CLI-004](../../docs/requirements.md#r-cli-004)): Git clones each repository that a paper
 * names into `.markdownpaper/repos/<name>/` of the project and checks out the rev of its reference, the head of a
 * branch, a tag or a commit, without a branch of its own. Git runs with the access of the author: its sign-in, or in
 * CI the token of `GITHUB_TOKEN` or `GH_TOKEN`.
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
 * getClone clones a repository into a folder, or fetches into the clone that is there, and checks out the rev of a
 * reference: the head of a branch, a tag, or a commit. A clone at its tag or commit needs no fetch. A clone with
 * changes of its files stays as it is.
 * @param git - The runner of Git.
 * @param folder - The folder of the clone.
 * @param spec - The reference; without a rev, the default branch.
 * @param options - `newest` moves a reference to a tag to the newest tag of a release.
 */
export async function getClone(git: Git, folder: string, spec: RemoteSpec, options: { newest?: boolean } = {}): Promise<Got> {
  const url = repositoryUrl(spec.repository);
  let before: string | undefined;
  const cloned = !fs.existsSync(path.join(folder, '.git'));
  if (!cloned) {
    const origin = (await git(['config', '--get', 'remote.origin.url'], folder)).trim();
    if (origin.replace(/\.git$/, '').toLowerCase() !== url.replace(/\.git$/, '').toLowerCase()) {
      throw new GitError(`The folder ${folder} is a clone of ${origin}, not of ${spec.repository}.`);
    }
    // A clone that was never checked out has only its folder .git.
    if (fs.readdirSync(folder).some((entry) => entry !== '.git')) {
      before = await commitOf(git, folder, 'HEAD');
      if ((await git(['status', '--porcelain', '--untracked-files=no'], folder)).trim() !== '') {
        throw new GitError(`The clone ${folder} has changes of its files, so it stays as it is. A layout that the project changes belongs in layouts/; remove the clone, and mp get clones it again.`);
      }
    }
  } else {
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    await git(['clone', '--quiet', '--no-checkout', '--filter=blob:none', url, folder], path.dirname(folder));
  }
  const rev = spec.ref ?? (await defaultBranch(git, folder));
  if (before && !options.newest) {
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
  await git(['checkout', '--quiet', '--force', '--detach', `${target}^{commit}`], folder);
  const commit = (await commitOf(git, folder, 'HEAD')) ?? '';
  return { commit, rev: checkout, kind, ...(before ? { before } : {}) };
}
