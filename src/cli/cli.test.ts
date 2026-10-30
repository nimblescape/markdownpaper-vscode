// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { version } from '../../package.json';
import { type Io, run } from './cli';

/** repository is the root folder of this repository. */
const repository = path.resolve(__dirname, '..', '..');

let folder: string;
let out: string[];
let err: string[];

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-cli-'));
  out = [];
  err = [];
});

afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

/**
 * io returns the streams of a run in the temporary folder.
 * @param answers - The answers to the questions, in their order; undefined for a run without a terminal.
 */
const io = (answers?: string[]): Io => ({
  out: (line) => out.push(line),
  err: (line) => err.push(line),
  ...(answers ? { ask: async () => answers.shift() ?? '' } : {}),
  cwd: folder,
  assets: { layouts: path.join(repository, 'layouts'), pagedJs: path.join(repository, 'node_modules/pagedjs/dist/paged.polyfill.js') },
});

const read = (file: string): string => fs.readFileSync(path.join(folder, file), 'utf8');

test('the help, the version and a wrong command (R-CLI-001)', async () => {
  expect(await run(['--help'], io())).toBe(0);
  expect(out.join('\n')).toContain('Usage: markdownpaper <command> [options]');
  expect(await run(['--version'], io())).toBe(0);
  expect(out.at(-1)).toBe(`markdownpaper ${version} (layouts: nimblescape-layout 1.0.0)`);
  expect(await run([], io())).toBe(2);
  expect(await run(['print'], io())).toBe(2);
  expect(err).toContain('markdownpaper: Unknown command: print');
  expect(await run(['check', '--fast', 'a.md'], io())).toBe(2);
  expect(err).toContain('markdownpaper: Unknown option: --fast');
});

test('create asks for what its options do not give, and writes the project (R-NEW-003)', async () => {
  expect(await run(['create', '--title', 'Agenten'], io(['studie', '', 'de-AT', 'Hannes Stauss']))).toBe(0);
  expect(read('studie/paper/paper.md')).toContain('title: "Agenten"\n');
  expect(read('studie/paper/paper.md')).toContain('author: "Hannes Stauss"\n');
  expect(JSON.parse(read('studie/layouts/plain/layout.json')).language).toBe('de-AT');
  expect(fs.existsSync(path.join(folder, 'studie/literatur/.gitkeep'))).toBe(true);
  expect(read('studie/AGENTS.md')).toContain('npx -y @nimblescape/markdownpaper pdf paper/paper.md');
});

test('create with --yes and new project ask nothing, and write no file over an existing one (R-NEW-003)', async () => {
  expect(await run(['create', 'one', '--yes'], io(['never']))).toBe(0);
  expect(read('one/paper/paper.md')).toContain('layout: plain\n');
  expect(await run(['new', 'project', 'one'], io())).toBe(2);
  expect(err.join('\n')).toContain('exist already, so nothing was written');
  expect(await run(['new', 'project', 'two', '--language', 'English'], io())).toBe(2);
  expect(fs.existsSync(path.join(folder, 'two'))).toBe(false);
});

test('new layout copies a layout, and new document uses the layout of the repository (R-NEW-001, R-NEW-002)', async () => {
  expect(await run(['new', 'layout', 'layouts/thesis', '--language', 'de-AT'], io())).toBe(0);
  expect(JSON.parse(read('layouts/thesis/layout.json'))).toMatchObject({ name: 'thesis', language: 'de-AT' });
  expect(await run(['new', 'document', 'paper/a.md', '--layout', 'thesis', '--title', 'A'], io())).toBe(0);
  expect(read('paper/a.md')).toContain('layout: thesis\n');
  expect(await run(['new', 'document', 'paper/b.md', '--layout', 'nope'], io())).toBe(2);
  expect(await run(['new', 'layout', 'layouts/bad name'], io())).toBe(2);
  expect(await run(['new', 'chapter', 'x'], io())).toBe(2);
});

test('check names the missing fields with the place in the file, and exits with 1 (R-DOC-002)', async () => {
  fs.writeFileSync(path.join(folder, 'a.md'), '---\nlayout: plain\ntitle: ""\n---\n');
  fs.writeFileSync(path.join(folder, 'b.md'), '---\nlayout: plain\ntitle: B\n---\n');
  expect(await run(['check', 'a.md', 'b.md'], io())).toBe(1);
  expect(err).toEqual([expect.stringMatching(/^a\.md:3:1: warning: The layout "plain" needs the field "title"/)]);
  err.length = 0;
  expect(await run(['check', 'b.md'], io())).toBe(0);
  expect(out.at(-1)).toBe('b.md: no problems');
  fs.writeFileSync(path.join(folder, 'c.md'), '# No front matter\n');
  expect(await run(['check', 'c.md'], io())).toBe(1);
  expect(await run(['check', 'missing.md'], io())).toBe(2);
});

test('instructions prints the list of the topics and each topic (R-CLI-003)', async () => {
  expect(await run(['instructions'], io())).toBe(0);
  expect(out.join('\n')).toContain('document   writing a document');
  expect(await run(['instructions', 'layout'], io())).toBe(0);
  expect(out.at(-1)).toContain('# The layout folder');
  expect(await run(['instructions', 'style'], io())).toBe(2);
});

test('pdf needs one file that exists (R-PDF-001)', async () => {
  expect(await run(['pdf'], io())).toBe(2);
  expect(await run(['pdf', 'missing.md'], io())).toBe(2);
  expect(err).toContain('markdownpaper: The file missing.md does not exist.');
});
