// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The references of a paper ([R-CLI-004](../../docs/requirements.md#r-cli-004)): the front matter names each other
 * repository that the paper uses as a reference to GitHub with a rev, the layout in the field `layout`
 * (`owner/repository/folder@rev`) and the repositories of the code of the listings in the map `repos`
 * (`name: owner/repository@rev`). `mp get` clones each one into `.markdownpaper/repos/<name>/` of the project. The
 * module reads and writes the references in the text of a paper, and uses no API of VS Code.
 */

import { isMap, isScalar, LineCounter, parseDocument, type Scalar } from 'yaml';
import { parseRemote, type RemoteSpec, referenceText } from './gallery';
import { layoutName } from './layout';

/** clonesFolder is the folder of the clones of a project, beside the paper repository's own files; Git ignores it. */
export const clonesFolder = '.markdownpaper/repos';

/** Reference is a reference of the front matter of a paper. */
export interface Reference {
  /** name is the name of its clone: the key in `repos`, or the name of the repository of the layout. */
  name: string;
  /** key is the field that holds it: `layout`, or `repos` with the name as its key. */
  key: 'layout' | 'repos';
  /** spec is the repository, the folder of a layout and the rev; text is the reference as the front matter has it. */
  spec: RemoteSpec;
  text: string;
  /** line and column are the place of the value in the file, counted from 0. */
  line: number;
  column: number;
}

/** ReferenceProblem is a reference that cannot be read, with its place in the file. */
export interface ReferenceProblem {
  message: string;
  line: number;
  column: number;
}

/**
 * cloneName returns the name of the clone of a repository: the name of the repository without its owner.
 * @param spec - The reference.
 */
export const cloneName = (spec: Pick<RemoteSpec, 'repository'>): string => spec.repository.split('/')[1];

/** opening and closing match the lines around a front matter. */
const opening = /^---[ \t]*$/;
const closing = /^(?:---|\.\.\.)[ \t]*$/;

/** Yaml is the YAML of a front matter: its text, the parsed document, and the line of its first line in the file. */
interface Yaml {
  lines: string[];
  end: number;
  text: string;
  document: ReturnType<typeof parseDocument>;
  counter: LineCounter;
}

/**
 * yamlOf parses the front matter of a text, or returns undefined when the text has none.
 * @param text - The Markdown text.
 */
function yamlOf(text: string): Yaml | undefined {
  const lines = text.split(/\r?\n/);
  if (!opening.test(lines[0] ?? '')) {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > 0 && closing.test(line));
  if (end < 0) {
    return undefined;
  }
  const counter = new LineCounter();
  const yaml = lines.slice(1, end).join('\n');
  return { lines, end, text: yaml, document: parseDocument(yaml, { lineCounter: counter, prettyErrors: false, uniqueKeys: true }), counter };
}

/**
 * placeOf returns the line and the column of an offset of the YAML in the file.
 * @param yaml - The YAML.
 * @param offset - The offset in the text of the YAML.
 */
function placeOf(yaml: Yaml, offset: number): { line: number; column: number } {
  const position = yaml.counter.linePos(offset);
  return { line: position.line, column: position.col - 1 };
}

/**
 * referencesOf reads the references of the front matter of a paper: the field `layout` when it names a layout on
 * GitHub, and each entry of `repos`. A value of `layout` without a slash names a folder of `layouts/` or a built-in
 * layout, and is no reference.
 * @param text - The Markdown text.
 */
export function referencesOf(text: string): { references: Reference[]; problems: ReferenceProblem[] } {
  const references: Reference[] = [];
  const problems: ReferenceProblem[] = [];
  const yaml = yamlOf(text);
  if (!yaml || !isMap(yaml.document.contents)) {
    return { references, problems };
  }
  for (const pair of yaml.document.contents.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : undefined;
    if (key === 'layout' && isScalar(pair.value) && typeof pair.value.value === 'string' && pair.value.value.includes('/')) {
      // A wrong reference of the layout is a problem of the search of the layout.
      const spec = parseRemote(pair.value.value);
      if (spec) {
        references.push({ name: cloneName(spec), key: 'layout', spec, text: pair.value.value.trim(), ...placeOf(yaml, pair.value.range?.[0] ?? 0) });
      }
    }
    if (key !== 'repos' || pair.value === null) {
      continue;
    }
    if (!isMap(pair.value)) {
      problems.push({ message: 'The field "repos" is a map of names and references, for example "server: org/server@v2.1.0".', ...placeOf(yaml, isScalar(pair.key) ? (pair.key.range?.[0] ?? 0) : 0) });
      continue;
    }
    for (const item of pair.value.items) {
      const name = isScalar(item.key) ? String(item.key.value) : '';
      const value = isScalar(item.value) && typeof item.value.value === 'string' ? item.value.value : '';
      const place = placeOf(yaml, (isScalar(item.value) ? item.value.range?.[0] : undefined) ?? (isScalar(item.key) ? (item.key.range?.[0] ?? 0) : 0));
      const spec = parseRemote(value);
      if (!layoutName.test(name)) {
        problems.push({ message: `The name "${name}" of a reference holds only letters, digits, ".", "-" and "_".`, ...place });
      } else if (!spec || spec.folder !== '') {
        problems.push({ message: `The reference "${value}" of ${name} is no reference to a repository on GitHub: <owner>/<repository>@<rev>.`, ...place });
      } else {
        references.push({ name, key: 'repos', spec, text: value.trim(), ...place });
      }
    }
  }
  return { references, problems };
}

/**
 * setReference writes a reference into the front matter of a paper and keeps the rest of the text as it is: the value
 * of the field `layout`, or of an entry of `repos`, which it adds when it is missing.
 * @param text - The Markdown text with its front matter.
 * @param key - `layout`, or the name of an entry of `repos`.
 * @param spec - The reference.
 * @returns The new text.
 */
export function setReference(text: string, key: 'layout' | { repos: string }, spec: RemoteSpec): string {
  const yaml = yamlOf(text);
  if (!yaml || !isMap(yaml.document.contents)) {
    throw new Error('The file has no front matter with fields.');
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const value = referenceText(spec);
  const replace = (node: Scalar): string => {
    const [start, end] = node.range ?? [0, 0];
    const yamlText = `${yaml.text.slice(0, start)}${value}${yaml.text.slice(end)}`;
    return [yaml.lines[0], ...yamlText.split('\n'), ...yaml.lines.slice(yaml.end)].join(newline);
  };
  const insert = (after: number, lines: string[]): string => [...yaml.lines.slice(0, after + 1), ...lines, ...yaml.lines.slice(after + 1)].join(newline);
  const pairOf = (name: string) => (yaml.document.contents as { items: { key: unknown; value: unknown }[] }).items.find((pair) => isScalar(pair.key) && String(pair.key.value) === name);
  if (key === 'layout') {
    const pair = pairOf('layout');
    return pair && isScalar(pair.value) ? replace(pair.value) : insert(0, [`layout: ${value}`]);
  }
  const repos = pairOf('repos');
  if (!repos) {
    return insert(yaml.end - 1, ['repos:', `  ${key.repos}: ${value}`]);
  }
  if (!isMap(repos.value)) {
    if (repos.value !== null && !(isScalar(repos.value) && (repos.value.value === null || repos.value.value === ''))) {
      throw new Error('The field "repos" is no map of names and references.');
    }
    return insert(placeOf(yaml, isScalar(repos.key) ? (repos.key.range?.[0] ?? 0) : 0).line, [`  ${key.repos}: ${value}`]);
  }
  const items = repos.value.items;
  const item = items.find((candidate) => isScalar(candidate.key) && String(candidate.key.value) === key.repos);
  if (item && isScalar(item.value)) {
    return replace(item.value);
  }
  const last = items[items.length - 1];
  const first = items[0];
  const indent = first && isScalar(first.key) ? placeOf(yaml, first.key.range?.[0] ?? 0).column : 2;
  const end = last && isScalar(last.value) ? placeOf(yaml, last.value.range?.[1] ?? 0).line : yaml.end - 1;
  return insert(end, [`${' '.repeat(indent)}${key.repos}: ${value}`]);
}

/** versionOf reads a tag of a release, such as `v2.1.0` or `1.4`, as its numbers, or returns undefined for another tag. */
function versionOf(tag: string): number[] | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(tag);
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : undefined;
}

/**
 * newestTag returns the newest tag of a release among the tags of a repository when it is newer than the current tag,
 * as `go get -u` moves to a newer version: a tag of the form `v2.1.0`, without a pre-release part.
 * @param tags - The tags of the repository.
 * @param current - The tag of the reference.
 * @returns The newer tag, or undefined when there is none or the current tag is no tag of a release.
 */
export function newestTag(tags: readonly string[], current: string): string | undefined {
  const compare = (a: number[], b: number[]): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  let best = versionOf(current);
  if (!best) {
    return undefined;
  }
  let newest: string | undefined;
  for (const tag of tags) {
    const version = versionOf(tag);
    if (version && compare(version, best) > 0) {
      best = version;
      newest = tag;
    }
  }
  return newest;
}
