// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { describe, expect, test } from 'vitest';
import { newestTag, referenceRanges, referencesOf, setReference, sortTags } from './references';

describe('the references of a paper (R-CLI-004)', () => {
  test('the field layout with a slash and each entry of repos are references, with their places in the file', () => {
    const text = '---\nlayout: majikmate/markdownpaper-layout-pht/thesis@main\ntitle: "T"\nrepos:\n  server: org/server@v2.1.0\n  tools: github:org/tools\n---\n# Text\n';
    const { references, problems } = referencesOf(text);
    expect(problems).toEqual([]);
    expect(references).toEqual([
      { name: 'markdownpaper-layout-pht', key: 'layout', spec: { repository: 'majikmate/markdownpaper-layout-pht', folder: 'thesis', ref: 'main' }, text: 'majikmate/markdownpaper-layout-pht/thesis@main', line: 1, column: 8 },
      { name: 'server', key: 'repos', spec: { repository: 'org/server', folder: '', ref: 'v2.1.0' }, text: 'org/server@v2.1.0', line: 4, column: 10 },
      { name: 'tools', key: 'repos', spec: { repository: 'org/tools', folder: '' }, text: 'github:org/tools', line: 5, column: 9 },
    ]);
    expect(referencesOf('---\nlayout: thesis\n---\n').references).toEqual([]);
    expect(referencesOf('# No front matter\n').references).toEqual([]);
  });

  test('a wrong entry of repos is a problem, and a wrong layout is left to the search of the layout', () => {
    expect(referencesOf('---\nlayout: a/b/../c\nrepos:\n  server: org/server/src@main\n  "bad name": org/x\n---\n').problems).toEqual([
      { message: 'The reference "org/server/src@main" of server is no reference to a repository on GitHub: <owner>/<repository>@<rev>.', line: 3, column: 10 },
      { message: 'The name "bad name" of a reference holds only letters, digits, ".", "-" and "_".', line: 4, column: 14 },
    ]);
    expect(referencesOf('---\nrepos: org/server\n---\n').problems[0].message).toBe('The field "repos" is a map of names and references, for example "server: org/server@v2.1.0".');
  });

  test('setReference changes a value, adds an entry or the map repos, and keeps the rest of the text', () => {
    const text = '---\r\nlayout: school/layouts/thesis@v1.0.0 # the layout\r\nrepos:\r\n    server: org/server@main\r\ntitle: "T"\r\n---\r\n# Text\r\n';
    expect(setReference(text, 'layout', { repository: 'school/layouts', folder: 'thesis', ref: 'v1.1.0' })).toBe(text.replace('@v1.0.0', '@v1.1.0'));
    expect(setReference(text, { repos: 'server' }, { repository: 'org/server', folder: '', ref: 'v2' })).toBe(text.replace('org/server@main', 'org/server@v2'));
    expect(setReference(text, { repos: 'tools' }, { repository: 'org/tools', folder: '', ref: 'main' })).toBe(text.replace('org/server@main\r\n', 'org/server@main\r\n    tools: org/tools@main\r\n'));
    expect(setReference('---\nlayout: plain\n---\n# Text\n', { repos: 'tools' }, { repository: 'org/tools', folder: '', ref: 'main' })).toBe('---\nlayout: plain\nrepos:\n  tools: org/tools@main\n---\n# Text\n');
    expect(setReference('---\nrepos:\ntitle: T\n---\n', { repos: 'tools' }, { repository: 'org/tools', folder: '', ref: 'main' })).toBe('---\nrepos:\n  tools: org/tools@main\ntitle: T\n---\n');
    expect(setReference('---\ntitle: T\n---\n', 'layout', { repository: 'a/b', folder: 'c', ref: 'main' })).toBe('---\nlayout: a/b/c@main\ntitle: T\n---\n');
    expect(() => setReference('# Text\n', 'layout', { repository: 'a/b', folder: '' })).toThrow('no front matter');
    expect(() => setReference('---\nrepos: [a]\n---\n', { repos: 'x' }, { repository: 'a/b', folder: '' })).toThrow('no map');
  });

  test('newestTag takes the highest tag of a release above the current one, as go get -u does', () => {
    expect(newestTag(['v1.0.0', 'v1.2.0', 'v1.10.0', 'v2.0.0-beta.1', 'latest'], 'v1.0.0')).toBe('v1.10.0');
    expect(newestTag(['1.0', '1.1'], '1.0')).toBe('1.1');
    expect(newestTag(['v1.0.0'], 'v1.0.0')).toBeUndefined();
    expect(newestTag(['v2.0.0'], 'stable')).toBeUndefined();
  });

  test('referenceRanges covers the text of each reference in its line, without the quotes of YAML', () => {
    const text = '---\nlayout: "school/layouts/thesis@v1"\nrepos:\n  server: org/server@main   # the API\n  bad: nothing\n---\n';
    expect(referenceRanges(text).map(({ reference, line, start, end }) => [reference.name, line, start, end])).toEqual([
      ['layouts', 1, 9, 33],
      ['server', 3, 10, 25],
    ]);
  });

  test('sortTags puts the tags of releases first, from the newest, and then the other tags', () => {
    expect(sortTags(['v1.0.0', 'nightly', 'v1.10.0', '2.0', 'v1.2.0', 'beta'])).toEqual(['2.0', 'v1.10.0', 'v1.2.0', 'v1.0.0', 'nightly', 'beta']);
  });
});
