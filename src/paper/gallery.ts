// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The layouts on GitHub ([R-LAY-007](../../docs/requirements.md#r-lay-007),
 * [R-NEW-004](../../docs/requirements.md#r-new-004)): the repositories with the topic `nimblescape-markdownpaper-layout`
 * hold layouts, each a folder with a `layout.json`, or the repository itself. The scaffold lists them for a choice and
 * copies the chosen one into the new project. The module reads GitHub through a fetcher and uses no API of VS Code.
 */

import { type Layout, layoutFile, parseLayout, type Problem } from './layout';
import type { Fetcher, Response } from './lookup';
import { layoutName } from './render';

/** layoutTopic is the topic of GitHub that marks a repository of layouts of nimblescape Markdown Paper. */
export const layoutTopic = 'nimblescape-markdownpaper-layout';

/** RemoteLayout is a layout in a repository on GitHub. */
export interface RemoteLayout {
  /** repository is the owner and the name of the repository, for example `majikmate/markdownpaper-layout-pht`. */
  repository: string;
  /** folder is the path of the layout folder in the repository, empty for a layout at its root. */
  folder: string;
  /** commit is the commit of the files; ref is the branch, tag or commit that was asked for. */
  commit: string;
  ref: string;
  /** layout is the read `layout.json`; files are the paths of the files of the folder, relative to it. */
  layout: Layout;
  files: string[];
  /** blobs are the IDs of the contents of the files, as Git gives them, by the paths of the files in the folder. */
  blobs: ReadonlyMap<string, string>;
}

/**
 * Origin is where a copy of a layout on GitHub comes from: the field `origin` of the `layout.json` of the copy
 * ([R-LAY-010](../../docs/requirements.md#r-lay-010)).
 */
export interface Origin {
  /** layout is the name of the layout on GitHub, for example `github:majikmate/markdownpaper-layout-pht/thesis`. */
  layout: string;
  /** ref is the branch, the tag or the commit that the copy follows. */
  ref: string;
  /** commit is the commit of the copied files. */
  commit: string;
}

/** RemoteSpec names a layout on GitHub: `github:owner/repository/folder`, with `@ref` for a branch, a tag or a commit. */
export interface RemoteSpec {
  repository: string;
  folder: string;
  ref?: string;
}

const api = 'https://api.github.com';
const raw = 'https://raw.githubusercontent.com';
const json = 'application/vnd.github+json';
const decoder = new TextDecoder();

/**
 * parseRemote reads the name of a layout on GitHub, `github:owner/repository/folder@ref`, or returns undefined for
 * another name, such as the name of a folder in `layouts/`.
 * @param text - The name.
 */
export function parseRemote(text: string): RemoteSpec | undefined {
  const match = /^github:([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)((?:\/[A-Za-z0-9._-]+)*)(?:@([^\s@]+))?$/.exec(text.trim());
  if (!match) {
    return undefined;
  }
  return { repository: match[1], folder: match[2].replace(/^\//, ''), ...(match[3] ? { ref: match[3] } : {}) };
}

/**
 * remoteName returns the name of a layout on GitHub for the option --layout, for example
 * `github:majikmate/markdownpaper-layout-pht/thesis`.
 * @param remote - The layout.
 */
export const remoteName = (remote: Pick<RemoteLayout, 'repository' | 'folder'>): string => `github:${remote.repository}${remote.folder ? `/${remote.folder}` : ''}`;

/**
 * originOf returns the origin of a copy of a layout on GitHub.
 * @param remote - The layout.
 */
export const originOf = (remote: RemoteLayout): Origin => ({ layout: remoteName(remote), ref: remote.ref, commit: remote.commit });

/**
 * readOrigin reads the field `origin` of the text of a `layout.json`, or returns undefined when it has no valid one: a
 * name of a layout on GitHub, a ref, and a commit of 40 hexadecimal digits.
 * @param text - The text of the `layout.json`.
 */
export function readOrigin(text: string): Origin | undefined {
  let origin: unknown;
  try {
    origin = (JSON.parse(text) as { origin?: unknown }).origin;
  } catch {
    return undefined;
  }
  const { layout, ref, commit } = (typeof origin === 'object' && origin !== null ? origin : {}) as Partial<Record<keyof Origin, unknown>>;
  if (typeof layout !== 'string' || !parseRemote(layout) || typeof ref !== 'string' || ref === '' || typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    return undefined;
  }
  return { layout, ref, commit };
}

/**
 * previewUrl returns the address of the preview PDF of a layout on GitHub, or undefined when it has none.
 * @param remote - The layout.
 */
export function previewUrl(remote: RemoteLayout): string | undefined {
  const { preview } = remote.layout;
  if (!preview || !remote.files.includes(preview.replace(/^\.\//, ''))) {
    return undefined;
  }
  return `https://github.com/${remote.repository}/blob/${remote.commit}/${encodePath(join(remote.folder, preview.replace(/^\.\//, '')))}`;
}

/** join joins a folder and a path in a repository. */
const join = (folder: string, path: string): string => (folder ? `${folder}/${path}` : path);

/** encodePath encodes each part of a path for an address. */
const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

/** headersOf returns the header Authorization for a token of GitHub, which raises the limit of the requests. */
const headersOf = (token: string | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/**
 * get sends a request to GitHub and returns the answer, or throws an error that names the cause.
 * @param fetch - The fetcher.
 * @param url - The address.
 * @param accept - The header Accept.
 * @param token - A token of GitHub, if any.
 */
async function get(fetch: Fetcher, url: string, accept: string, token: string | undefined): Promise<Response> {
  const response = await fetch(url, accept, url.startsWith(api) ? headersOf(token) : {});
  if (response.status === 403 || response.status === 429) {
    throw new Error(`GitHub refused ${url} (${response.status}): the limit of requests without a sign-in may be reached; set GITHUB_TOKEN or try again later.`);
  }
  if (response.status !== 200) {
    throw new Error(`GitHub answered ${response.status} for ${url}.`);
  }
  return response;
}

/** Tree is the list of the files of a commit of a repository, with the ID of the content of each file. */
interface Tree {
  commit: string;
  paths: string[];
  blobs: ReadonlyMap<string, string>;
}

/**
 * treeOf reads the commit of a branch, a tag or a commit of a repository, and the paths of its files.
 * @param fetch - The fetcher.
 * @param repository - The owner and the name of the repository.
 * @param ref - The branch, the tag or the commit.
 * @param token - A token of GitHub, if any.
 */
async function treeOf(fetch: Fetcher, repository: string, ref: string, token: string | undefined): Promise<Tree> {
  const commit = decoder.decode((await get(fetch, `${api}/repos/${repository}/commits/${encodeURIComponent(ref)}`, 'application/vnd.github.sha', token)).body).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`GitHub gave no commit for ${repository}@${ref}.`);
  }
  const tree = JSON.parse(decoder.decode((await get(fetch, `${api}/repos/${repository}/git/trees/${commit}?recursive=1`, json, token)).body)) as { tree?: { path: string; type: string; sha?: string }[] };
  const blobs = (tree.tree ?? []).filter((entry) => entry.type === 'blob');
  return { commit, paths: blobs.map((entry) => entry.path), blobs: new Map(blobs.map((entry) => [entry.path, entry.sha ?? ''])) };
}

/**
 * readRemote reads the `layout.json` of a folder of a repository at a commit.
 * @param fetch - The fetcher.
 * @param repository - The owner and the name of the repository.
 * @param folder - The folder of the layout, empty for the root.
 * @param tree - The commit and the files of the repository.
 * @param ref - The branch, tag or commit that was asked for.
 */
async function readRemote(fetch: Fetcher, repository: string, folder: string, tree: Tree, ref: string): Promise<{ remote?: RemoteLayout; problems: Problem[] }> {
  const id = folder.split('/').pop() || repository.split('/')[1];
  const base = `${raw}/${repository}/${tree.commit}/${folder ? `${encodePath(folder)}/` : ''}`;
  const response = await get(fetch, `${base}${layoutFile}`, 'application/json', undefined);
  const { layout, problems } = parseLayout(decoder.decode(response.body), id, base);
  if (!layout) {
    return { problems };
  }
  const prefix = folder ? `${folder}/` : '';
  const files = tree.paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
  const blobs = new Map(files.map((path) => [path, tree.blobs.get(prefix + path) ?? '']));
  return { remote: { repository, folder, commit: tree.commit, ref, layout, files, blobs }, problems };
}

/**
 * layoutFolders returns the folders of a repository that hold a layout: the root and each folder up to two levels deep
 * with a `layout.json`, whose name is a valid name of a layout.
 * @param paths - The paths of the files of the repository.
 */
export function layoutFolders(paths: readonly string[]): string[] {
  return paths
    .filter((path) => path === layoutFile || (path.endsWith(`/${layoutFile}`) && path.split('/').length <= 3))
    .map((path) => path.slice(0, -layoutFile.length).replace(/\/$/, ''))
    .filter((folder) => folder === '' || layoutName.test(folder.split('/').pop() ?? ''))
    .sort();
}

/**
 * findRemote reads one layout on GitHub by its name.
 * @param fetch - The fetcher.
 * @param spec - The name of the layout.
 * @param token - A token of GitHub, if any.
 */
export async function findRemote(fetch: Fetcher, spec: RemoteSpec, token?: string): Promise<RemoteLayout> {
  let ref = spec.ref;
  if (!ref) {
    const repository = JSON.parse(decoder.decode((await get(fetch, `${api}/repos/${spec.repository}`, json, token)).body)) as { default_branch?: string };
    ref = repository.default_branch ?? 'main';
  }
  const tree = await treeOf(fetch, spec.repository, ref, token);
  if (!tree.paths.includes(join(spec.folder, layoutFile))) {
    throw new Error(`${spec.repository}@${ref} has no layout in ${spec.folder || 'its root'}: no ${layoutFile}.`);
  }
  const { remote, problems } = await readRemote(fetch, spec.repository, spec.folder, tree, ref);
  if (!remote) {
    throw new Error(problems.map((problem) => problem.message).join(' '));
  }
  return remote;
}

/**
 * findRemotes lists the layouts of the repositories with the topic of the layouts, in the order of the stars of the
 * repositories and of the folders, and the problems of the repositories that it could not read.
 * @param fetch - The fetcher.
 * @param token - A token of GitHub, if any.
 */
export async function findRemotes(fetch: Fetcher, token?: string): Promise<{ layouts: RemoteLayout[]; problems: string[] }> {
  const search = JSON.parse(decoder.decode((await get(fetch, `${api}/search/repositories?q=${encodeURIComponent(`topic:${layoutTopic}`)}&sort=stars&per_page=50`, json, token)).body)) as {
    items?: { full_name: string; default_branch?: string; archived?: boolean }[];
  };
  const layouts: RemoteLayout[] = [];
  const problems: string[] = [];
  for (const item of (search.items ?? []).filter((candidate) => !candidate.archived)) {
    try {
      const ref = item.default_branch ?? 'main';
      const tree = await treeOf(fetch, item.full_name, ref, token);
      for (const folder of layoutFolders(tree.paths)) {
        const { remote } = await readRemote(fetch, item.full_name, folder, tree, ref);
        if (remote) {
          layouts.push(remote);
        }
      }
    } catch (error) {
      problems.push(`${item.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { layouts, problems };
}

/**
 * downloadRemote reads the files of a layout on GitHub, by their paths in its folder, without its preview PDF, which a
 * new project does not copy.
 * @param fetch - The fetcher.
 * @param remote - The layout.
 */
export async function downloadRemote(fetch: Fetcher, remote: RemoteLayout): Promise<Map<string, Uint8Array>> {
  const preview = remote.layout.preview?.replace(/^\.\//, '');
  return downloadFiles(fetch, remote, remote.files.filter((candidate) => candidate !== preview));
}

/**
 * downloadFiles reads some files of a layout on GitHub at its commit, by their paths in its folder.
 * @param fetch - The fetcher.
 * @param remote - The layout.
 * @param paths - The paths of the files in the folder of the layout.
 */
export async function downloadFiles(fetch: Fetcher, remote: Pick<RemoteLayout, 'repository' | 'folder' | 'commit'>, paths: readonly string[]): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const path of paths) {
    files.set(path, (await get(fetch, `${raw}/${remote.repository}/${remote.commit}/${encodePath(join(remote.folder, path))}`, '*/*', undefined)).body);
  }
  return files;
}
