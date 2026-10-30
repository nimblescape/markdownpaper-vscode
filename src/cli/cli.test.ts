// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { version } from '../../package.json';
import type { Fetcher } from '../paper/lookup';
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
  expect(fs.existsSync(path.join(folder, 'studie/inbox/.gitkeep'))).toBe(true);
  expect(fs.existsSync(path.join(folder, 'studie/bib/.gitkeep'))).toBe(true);
  expect(read('studie/AGENTS.md')).toContain('Process each file in `inbox/`');
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

test('format writes the lists of the special sections, and --check exits with 1 for a file that the format changes (R-CLI-002, R-REN-004)', async () => {
  fs.writeFileSync(path.join(folder, 'a.md'), '---\nlayout: plain\nlang: de-AT\n---\n\n# Inhaltsverzeichnis\n\n# Einleitung\n');
  expect(await run(['format', '--check', 'a.md'], io())).toBe(1);
  expect(err).toEqual(['a.md: warning: The format changes the file; run markdownpaper format a.md.']);
  expect(read('a.md')).not.toContain('<!-- toc -->');
  expect(await run(['format', 'a.md'], io())).toBe(0);
  expect(read('a.md')).toBe('---\nlayout: plain\nlang: de-AT\n---\n\n# Inhaltsverzeichnis\n\n<!-- toc -->\n- [1 Einleitung](#einleitung)\n<!-- /toc -->\n\n# Einleitung\n');
  expect(await run(['format', '--check', 'a.md'], io())).toBe(0);
  expect(out.at(-1)).toBe('a.md: no change');
  expect(await run(['format', 'missing.md'], io())).toBe(2);
});

test('format writes the citations and the reference list in the style of a CSL file of the layout, and check names a citation of no data (R-CLI-002, R-CITE-003, R-CITE-004)', async () => {
  fs.mkdirSync(path.join(folder, 'layouts/pht'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'layouts/pht/layout.json'), JSON.stringify({ format: 'nimblescape-layout 1.0.0', language: 'de-AT', citationStyle: 'pht-apa7.csl', stylesheets: [] }));
  fs.copyFileSync(path.join(repository, 'test/fixtures/pht-apa7.csl'), path.join(folder, 'layouts/pht/pht-apa7.csl'));
  const source = '{"id":"huber","type":"book","author":[{"family":"Huber","given":"Anna"}],"title":"Musik"}';
  fs.writeFileSync(path.join(folder, 'a.md'), `---\nlayout: pht\n---\n\n# Einleitung\n\nText ([x](#huber "page 13-14")).\n\n<!-- nimblescape-sources\n${source}\n-->\n`);
  expect(await run(['format', 'a.md'], io())).toBe(0);
  expect(read('a.md')).toBe(
    `---\nlayout: pht\n---\n\n# Einleitung\n\nText ([Huber, o.\u00a0D., S. 13\u00a0–\u00a014](#huber "page 13-14")).\n\n# Literaturverzeichnis\n\n<a id="huber"></a>Huber, A. (o.\u00a0D.). *Musik*.\n\n<!-- nimblescape-sources\n${source}\n-->\n`,
  );
  fs.writeFileSync(path.join(folder, 'a.md'), read('a.md').replace('"page 13-14"', '"S. 13"'));
  expect(await run(['check', 'a.md'], io())).toBe(1);
  expect([...out, ...err].join('\n')).toContain('The title of this citation holds "S. 13", which is no data of a citation.');
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

/**
 * services returns a network that answers with the recorded answers of test/fixtures/metadata/ and lists the asked
 * addresses.
 * @param answers - The recorded answers by the start of the address.
 * @param asked - The list of the asked addresses.
 */
const services = (answers: Record<string, string>, asked: string[] = []): Fetcher => async (url) => {
  asked.push(url);
  const key = Object.keys(answers).find((start) => url.startsWith(start));
  const body = key ? fs.readFileSync(path.join(repository, 'test/fixtures/metadata', answers[key])) : new Uint8Array();
  return { status: key ? 200 : 404, type: 'application/json', url: key && url.startsWith('https://doi.org/') ? 'https://api.crossref.org/v1/works/x/transform' : url, body: new Uint8Array(body) };
};

test('source adds the sources of a DOI and of an export to the database, once each, and names the missing fields (R-CITE-005)', async () => {
  fs.writeFileSync(path.join(folder, 'a.md'), '# Text\r\n\r\nWords.\r\n');
  fs.writeFileSync(path.join(folder, 'export.ris'), ['TY  - BOOK', 'AU  - Muster, Erika', 'PY  - 2020', 'TI  - Ein Buch', 'ER  - ', ''].join('\n'));
  const asked: string[] = [];
  const network = { ...io(), fetch: services({ 'https://doi.org/10.3390/bs9040039': 'doi-journal.json' }, asked), today: new Date(2026, 9, 30) };
  expect(await run(['source', 'a.md', 'https://doi.org/10.3390/BS9040039', 'export.ris'], network)).toBe(0);
  expect(out).toEqual([
    'https://doi.org/10.3390/BS9040039: added festman2019 (article-journal) from doi.org (Crossref)',
    'export.ris: added muster2020 (book) from the RIS file',
    '  muster2020 needs these fields and did not get them: publisher. Take them from the source itself, or leave them out.',
    'a.md: 2 sources added',
  ]);
  expect(asked).toEqual(['https://doi.org/10.3390/bs9040039']);
  const lines = read('a.md').split('\r\n');
  expect(lines.slice(0, 5)).toEqual(['# Text', '', 'Words.', '', '<!-- nimblescape-sources']);
  expect(lines.slice(5).map((line) => (line.startsWith('{') ? JSON.parse(line).id : line))).toEqual(['festman2019', 'muster2020', '-->', '']);

  out.length = 0;
  expect(await run(['source', 'a.md', '10.3390/bs9040039', '--dry-run'], network)).toBe(0);
  expect(out).toEqual(['10.3390/bs9040039: the database has this source already as festman2019 (the same DOI); nothing added']);
});

test('source gives the exit code 1 for an input without a source, 2 for a wrong call, and searches Crossref (R-CITE-005)', async () => {
  fs.writeFileSync(path.join(folder, 'a.md'), 'Words.\n');
  const network = { ...io(), fetch: services({ 'https://api.crossref.org/works': 'crossref-search.json' }) };
  expect(await run(['source', 'a.md', '10.1000/none', 'no-such-thing'], network)).toBe(1);
  expect(err).toEqual(['10.1000/none: error: doi.org does not know it (DOI 10.1000/none).', 'no-such-thing: error: This is no file and no DOI, ISBN, PubMed ID, arXiv ID or web address.']);
  expect(read('a.md')).toBe('Words.\n');
  expect(await run(['source', 'a.md', '10.3390/bs9040039', '--offline'], network)).toBe(1);
  expect(await run(['source', 'a.md'], network)).toBe(2);
  expect(await run(['source', 'a.md', '10.1000/a', '10.1000/b', '--id', 'law'], network)).toBe(2);
  expect(await run(['source', 'missing.md', '10.1000/a'], network)).toBe(2);
  out.length = 0;
  expect(await run(['source', '--search', 'Guidelines for Human-AI Interaction'], network)).toBe(0);
  expect(out[1]).toBe(
    '10.1145/3511605  Li et al. (2023). Assessing Human-AI Interaction Early through Factorial Surveys: A Study on the Guidelines for Human-AI Interaction. ACM Transactions on Computer-Human Interaction. [article-journal]',
  );
  expect(out.at(-1)).toBe('Add the right one by its DOI: markdownpaper source <file.md> <DOI>');
});
