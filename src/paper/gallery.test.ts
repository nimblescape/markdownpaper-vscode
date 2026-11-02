// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the layouts on GitHub ([R-LAY-007](../../docs/requirements.md#r-lay-007),
 * [R-NEW-004](../../docs/requirements.md#r-new-004)). A map of addresses stands for GitHub.
 */

import { describe, expect, test } from 'vitest';
import { downloadRemote, findRemote, findRemotes, layoutFolders, parseRemote, previewUrl, referenceText, remoteName } from './gallery';
import { formatText } from './layout';
import type { Fetcher } from './lookup';

const encoder = new TextEncoder();
const commit = 'a'.repeat(40);
const other = 'b'.repeat(40);

/** layoutJson returns the text of a `layout.json` with a name, an empty paper document and a preview. */
const layoutJson = (name: string): string => JSON.stringify({ format: formatText, name, document: 'document.md', preview: 'document.pdf' });

/** github returns a fetcher that answers from a map of addresses, and records the addresses and the headers that it gets. */
function github(answers: Record<string, string>, asked: { url: string; headers: Readonly<Record<string, string>> }[] = []): Fetcher {
  return async (url, _accept, headers = {}) => {
    asked.push({ url, headers });
    const body = answers[url];
    return { status: body === undefined ? 404 : 200, type: 'application/json', url, body: encoder.encode(body ?? '') };
  };
}

const api = 'https://api.github.com/repos';
const raw = 'https://raw.githubusercontent.com';

/** pht is the answer of GitHub for a repository with two layout folders, a folder without a valid name and a deeper file. */
const pht: Record<string, string> = {
  'https://api.github.com/search/repositories?q=topic%3Animblescape-markdownpaper-layout&sort=stars&per_page=50': JSON.stringify({
    items: [
      { full_name: 'majikmate/markdownpaper-layout-pht', default_branch: 'main' },
      { full_name: 'old/layouts', default_branch: 'main', archived: true },
      { full_name: 'broken/layouts', default_branch: 'main' },
    ],
  }),
  [`${api}/majikmate/markdownpaper-layout-pht`]: JSON.stringify({ default_branch: 'main' }),
  [`${api}/majikmate/markdownpaper-layout-pht/commits/main`]: commit,
  [`${api}/majikmate/markdownpaper-layout-pht/commits/feature%2Fx`]: other,
  [`${api}/majikmate/markdownpaper-layout-pht/git/trees/${commit}?recursive=1`]: JSON.stringify({
    tree: [
      { path: 'README.md', type: 'blob' },
      { path: 'thesis-v4', type: 'tree' },
      { path: 'thesis-v4/layout.json', type: 'blob' },
      { path: 'thesis-v4/document.md', type: 'blob' },
      { path: 'thesis-v4/document.pdf', type: 'blob' },
      { path: 'thesis-v4/images/folders.svg', type: 'blob' },
      { path: 'concept-v2/layout.json', type: 'blob' },
      { path: 'bad name/layout.json', type: 'blob' },
      { path: 'a/b/c/layout.json', type: 'blob' },
    ],
  }),
  [`${api}/majikmate/markdownpaper-layout-pht/git/trees/${other}?recursive=1`]: JSON.stringify({ tree: [{ path: 'thesis-v4/layout.json', type: 'blob' }] }),
  [`${raw}/majikmate/markdownpaper-layout-pht/${commit}/thesis-v4/layout.json`]: layoutJson('PHT Abschlussarbeit v4'),
  [`${raw}/majikmate/markdownpaper-layout-pht/${commit}/concept-v2/layout.json`]: JSON.stringify({ format: formatText, name: 'PHT Konzeptpapier v2' }),
  [`${raw}/majikmate/markdownpaper-layout-pht/${other}/thesis-v4/layout.json`]: layoutJson('PHT Abschlussarbeit v4 (x)'),
  [`${raw}/majikmate/markdownpaper-layout-pht/${commit}/thesis-v4/document.md`]: '# Start\n',
  [`${raw}/majikmate/markdownpaper-layout-pht/${commit}/thesis-v4/images/folders.svg`]: '<svg/>',
};

describe('the names of the layouts on GitHub (R-LAY-007)', () => {
  test('a reference owner/repository/folder with an optional @rev is read, also with github: before it, and another name is none (R-CLI-004)', () => {
    expect(parseRemote('majikmate/markdownpaper-layout-pht/thesis@main')).toEqual({ repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis', ref: 'main' });
    expect(parseRemote('org/server@v2.1.0')).toEqual({ repository: 'org/server', folder: '', ref: 'v2.1.0' });
    expect(parseRemote('github:majikmate/markdownpaper-layout-pht/thesis-v4')).toEqual({ repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis-v4' });
    expect(parseRemote('github:majikmate/markdownpaper-layout-pht/thesis-v4@claude/x')).toEqual({ repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis-v4', ref: 'claude/x' });
    expect(parseRemote('github:owner/layout@v1.0.0')).toEqual({ repository: 'owner/layout', folder: '', ref: 'v1.0.0' });
    expect(parseRemote('github:owner')).toBeUndefined();
    expect(parseRemote('thesis-v4')).toBeUndefined();
    expect(parseRemote('../thesis')).toBeUndefined();
    expect(remoteName({ repository: 'owner/layout', folder: '' })).toBe('owner/layout');
    expect(referenceText({ repository: 'owner/layout', folder: 'thesis', ref: 'v1.0.0' })).toBe('owner/layout/thesis@v1.0.0');
    expect(referenceText({ repository: 'owner/layout', folder: '' })).toBe('owner/layout');
  });

  test('the layout folders are the root and the folders up to two levels deep with a layout.json and a valid name', () => {
    expect(layoutFolders(['layout.json', 'thesis-v4/layout.json', 'group/concept/layout.json', 'a/b/c/layout.json', 'bad name/layout.json', 'thesis-v4/page.css'])).toEqual(['', 'group/concept', 'thesis-v4']);
  });
});

describe('the list of the layouts on GitHub (R-NEW-004)', () => {
  test('the repositories with the topic give their layout folders; an archived repository stays out, and a broken one is a problem', async () => {
    const asked: { url: string; headers: Readonly<Record<string, string>> }[] = [];
    const { layouts, problems } = await findRemotes(github(pht, asked), 'token-1');
    expect(layouts.map((layout) => [remoteName(layout), layout.layout.name, layout.commit])).toEqual([
      ['majikmate/markdownpaper-layout-pht/concept-v2', 'PHT Konzeptpapier v2', commit],
      ['majikmate/markdownpaper-layout-pht/thesis-v4', 'PHT Abschlussarbeit v4', commit],
    ]);
    expect(problems).toEqual([`broken/layouts: GitHub answered 404 for ${api}/broken/layouts/commits/main.`]);
    expect(asked.some((request) => request.url.includes('old/layouts'))).toBe(false);
    // The token goes only to the API of GitHub, not to the files of raw.githubusercontent.com.
    expect(asked.filter((request) => request.headers.Authorization === 'Bearer token-1').every((request) => request.url.startsWith('https://api.github.com/'))).toBe(true);
    expect(asked.filter((request) => request.url.startsWith(raw)).every((request) => request.headers.Authorization === undefined)).toBe(true);

    const thesis = layouts[1];
    expect(thesis.files).toEqual(['layout.json', 'document.md', 'document.pdf', 'images/folders.svg']);
    expect(previewUrl(thesis)).toBe(`https://github.com/majikmate/markdownpaper-layout-pht/blob/${commit}/thesis-v4/document.pdf`);
    expect(previewUrl(layouts[0])).toBeUndefined();
  });

  test('one layout is read by its name, on the default branch or on a ref, and a folder without a layout is an error', async () => {
    const fetch = github(pht);
    expect((await findRemote(fetch, { repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis-v4' })).ref).toBe('main');
    const branch = await findRemote(fetch, { repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis-v4', ref: 'feature/x' });
    expect([branch.commit, branch.layout.name]).toEqual([other, 'PHT Abschlussarbeit v4 (x)']);
    await expect(findRemote(fetch, { repository: 'majikmate/markdownpaper-layout-pht', folder: 'nothing', ref: 'main' })).rejects.toThrow('has no layout in nothing');
    await expect(findRemote(github({}), { repository: 'a/b', folder: '', ref: 'main' })).rejects.toThrow('GitHub answered 404');
  });

  test('a refused request names the limit of the requests', async () => {
    const refused: Fetcher = async (url) => ({ status: 403, type: 'application/json', url, body: new Uint8Array() });
    await expect(findRemotes(refused)).rejects.toThrow('set GITHUB_TOKEN');
  });

  test('the download reads the files of the layout at its commit, without the preview PDF', async () => {
    const remote = await findRemote(github(pht), { repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis-v4', ref: 'main' });
    const files = await downloadRemote(github(pht), remote);
    expect([...files.keys()]).toEqual(['layout.json', 'document.md', 'images/folders.svg']);
    expect(new TextDecoder().decode(files.get('document.md'))).toBe('# Start\n');
  });
});
