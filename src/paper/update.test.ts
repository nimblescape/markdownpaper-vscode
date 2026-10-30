// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the update of a copy of a layout on GitHub ([R-LAY-010](../../docs/requirements.md#r-lay-010)). A map
 * of addresses stands for GitHub, with two commits of one layout folder.
 */

import { describe, expect, test } from 'vitest';
import { readOrigin } from './gallery';
import { formatText, termsFor } from './layout';
import type { Fetcher } from './lookup';
import { newLayoutFiles, newProjectFiles } from './scaffold';
import { blobId, mergeLayoutJson, planUpdate } from './update';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const before = 'a'.repeat(40);
const after = 'b'.repeat(40);
const api = 'https://api.github.com/repos/owner/layouts';
const raw = 'https://raw.githubusercontent.com/owner/layouts';
const origin = { layout: 'github:owner/layouts/thesis', ref: 'main', commit: before };

/** textOf returns the text of the content of a new file. */
const textOf = (content: string | Uint8Array | undefined): string => (typeof content === 'string' ? content : decoder.decode(content));

/** layoutJson returns the text of a `layout.json`. */
const layoutJson = (fields: Record<string, unknown>): string => `${JSON.stringify({ format: formatText, name: 'Thesis', language: 'de-AT', document: 'document.md', preview: 'document.pdf', ...fields }, null, 2)}\n`;

/** versions are the files of the folder `thesis/` at the two commits. */
const versions: Record<string, Record<string, string>> = {
  [before]: { 'layout.json': layoutJson({ hyphenate: true }), 'page.css': 'p {}\n', 'cover.html': '<p>Cover</p>\n', 'old.css': 'a {}\n', 'document.md': '# Start\n', 'document.pdf': '%PDF-1' },
  // The file of the repository has an array on one line, which the copy keeps.
  [after]: { 'layout.json': layoutJson({ hyphenate: false, pdfName: '{{title}}', stylesheets: ['page.css'] }).replace(/\[\n\s+"page\.css"\n\s+\]/, '["page.css"]'), 'page.css': 'p { margin: 0; }\n', 'cover.html': '<p>Cover</p>\n', 'fonts/new.ttf': 'font', 'document.md': '# Start\n', 'document.pdf': '%PDF-2' },
};

/** github returns a fetcher with the two commits, where the branch main is at the commit `head`. */
function github(head: string): Fetcher {
  const answers: Record<string, string> = { [`${api}/commits/main`]: head, [`${api}/commits/${before}`]: before, [`${api}/commits/${after}`]: after };
  for (const [commit, files] of Object.entries(versions)) {
    answers[`${api}/git/trees/${commit}?recursive=1`] = JSON.stringify({
      tree: [{ path: 'README.md', type: 'blob', sha: 'c'.repeat(40) }, ...Object.entries(files).map(([path, content]) => ({ path: `thesis/${path}`, type: 'blob', sha: blobId(encoder.encode(content)) }))],
    });
    for (const [path, content] of Object.entries(files)) {
      answers[`${raw}/${commit}/thesis/${path}`] = content;
    }
  }
  return async (url) => ({ status: url in answers ? 200 : 404, type: 'text/plain', url, body: encoder.encode(answers[url] ?? '') });
}

/** copyOf returns the files of a copy of the folder at the commit `before`, as a new project writes it, with changes. */
function copyOf(changes: Record<string, string | undefined> = {}): Map<string, Uint8Array> {
  const source = new Map(Object.entries(versions[before]).map(([path, content]) => [path, encoder.encode(content)]));
  const files = new Map(newLayoutFiles(source, { name: 'Thesis', language: 'de-AT', origin }).map((file) => [file.path, encoder.encode(textOf(file.content))]));
  for (const [path, content] of Object.entries(changes)) {
    if (content === undefined) {
      files.delete(path);
    } else {
      files.set(path, encoder.encode(content));
    }
  }
  return files;
}

describe('the origin of a copy (R-LAY-010)', () => {
  test('a new project writes the origin into the layout.json of its copy, and a new layout leaves it out', () => {
    const files = copyOf();
    expect(readOrigin(decoder.decode(files.get('layout.json')))).toEqual(origin);
    expect(files.has('document.pdf')).toBe(false);
    const layout = { id: 'thesis', name: 'Thesis', language: 'de-AT', fields: {}, terms: termsFor('de-AT') } as unknown as Parameters<typeof newProjectFiles>[0]['layout'];
    // A project from a copy in layouts/ of the workspace keeps the origin of the copy.
    const project = newProjectFiles({ layout, source: files, language: 'de-AT', values: {} }, undefined);
    expect(readOrigin(textOf(project.find((file) => file.path === 'layouts/thesis/layout.json')?.content))).toEqual(origin);
    expect(readOrigin(textOf(newLayoutFiles(files, { name: 'Mine' }).find((file) => file.path === 'layout.json')?.content))).toBeUndefined();
    // The copy keeps the form of the layout.json of the layout, such as an array on one line.
    const copied = newLayoutFiles(new Map([['layout.json', encoder.encode(versions[after]['layout.json'])]]), { name: 'Thesis', origin });
    expect(textOf(copied[0].content)).toContain('"stylesheets": ["page.css"]');
  });

  test('an origin needs a name of a layout on GitHub, a ref and a commit of 40 hexadecimal digits', () => {
    expect(readOrigin(JSON.stringify({ origin: { ...origin, commit: 'abc' } }))).toBeUndefined();
    expect(readOrigin(JSON.stringify({ origin: { ...origin, layout: 'thesis' } }))).toBeUndefined();
    expect(readOrigin('{')).toBeUndefined();
  });
});

describe('the update of a copy (R-LAY-010)', () => {
  test('a copy at the newest commit is up to date', async () => {
    const update = await planUpdate(github(before), copyOf());
    expect(update.from).toBe(update.origin.commit);
    expect(update.write.size).toBe(0);
  });

  test('the files that only the repository changed get their new versions; the preview PDF stays out', async () => {
    const update = await planUpdate(github(after), copyOf());
    expect(update.origin).toEqual({ ...origin, commit: after });
    expect(update.changed).toEqual(['layout.json', 'fonts/new.ttf', 'old.css', 'page.css']);
    expect(update.remove).toEqual(['old.css']);
    expect([...update.write.keys()].sort()).toEqual(['fonts/new.ttf', 'layout.json', 'page.css']);
    expect(update.conflicts).toEqual([]);
    const text = decoder.decode(update.write.get('layout.json'));
    expect(JSON.parse(text)).toEqual({ format: formatText, name: 'Thesis', language: 'de-AT', document: 'document.md', preview: 'document.pdf', hyphenate: false, pdfName: '{{title}}', stylesheets: ['page.css'], origin: { ...origin, commit: after } });
    // The copy keeps the form of the file of the repository, and only adds the origin.
    expect(versions[after]['layout.json']).toContain('"stylesheets": ["page.css"]');
    expect(text).toBe(versions[after]['layout.json'].replace(/\n}\n$/, `,\n  "origin": ${JSON.stringify({ ...origin, commit: after }, null, 2).replace(/\n/g, '\n  ')}\n}\n`));
  });

  test('the changes of the project stay where the repository changed nothing, also its language', async () => {
    const local = layoutJson({ hyphenate: true, language: 'en-US', origin }).replace('"format": "nimblescape-layout 1.0.0"', `"format": "${formatText}"`);
    const update = await planUpdate(github(after), copyOf({ 'cover.html': '<p>Mine</p>\n', 'layout.json': local, 'notes.txt': 'mine' }));
    expect(update.kept).toEqual(['cover.html']);
    expect(update.conflicts).toEqual([]);
    expect(update.write.has('cover.html')).toBe(false);
    expect(JSON.parse(decoder.decode(update.write.get('layout.json'))).language).toBe('en-US');
  });

  test('a file that the project and the repository both changed is a conflict, which --force replaces', async () => {
    const copy = copyOf({ 'page.css': 'p { color: red; }\n', 'old.css': undefined });
    const update = await planUpdate(github(after), copy);
    expect(update.conflicts).toEqual(['page.css']);
    expect(update.write.has('page.css')).toBe(false);
    // A file that the project removed and the repository removed too is no conflict.
    expect(update.remove).toEqual([]);
    const forced = await planUpdate(github(after), copy, { force: true });
    expect(decoder.decode(forced.write.get('page.css'))).toBe('p { margin: 0; }\n');
  });

  test('a copy without an origin is an error', async () => {
    await expect(planUpdate(github(after), copyOf({ 'layout.json': layoutJson({}) }))).rejects.toThrow('has no field "origin"');
  });

  test('layout.json is merged field by field', () => {
    const merged = mergeLayoutJson({ format: 'x', a: 1, b: 2, c: 3, own: true }, { format: 'y', a: 1, b: 1, c: 1 }, { format: 'z', a: 2, b: 1, c: 4, added: 'new' }, false);
    expect(merged).toEqual({ json: { format: formatText, a: 2, b: 2, c: 3, added: 'new', own: true }, conflicts: ['c'], changed: true });
    expect(mergeLayoutJson({ c: 3 }, { c: 1 }, { c: 4 }, true).json).toEqual({ c: 4 });
  });
});
