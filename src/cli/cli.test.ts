// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { version } from '../../package.json';
import type { Fetcher } from '../paper/lookup';
import { blobId } from '../paper/update';
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
  assets: {
    layouts: path.join(repository, 'layouts'),
    pagedJs: path.join(repository, 'node_modules/pagedjs/dist/paged.polyfill.js'),
    plantUml: path.join(repository, 'node_modules/@nimblescape/plantuml/dist/page'),
  },
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
    `---\nlayout: pht\n---\n\n# Einleitung\n\nText ([Huber, o.\u00a0D., S.\u00a013\u00a0–\u00a014](#huber "page 13-14")).\n\n# Literaturverzeichnis\n\n<a id="huber"></a>Huber, A. (o.\u00a0D.). *Musik*.\n\n<!-- nimblescape-sources\n${source}\n-->\n`,
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

test('source adds nothing for a wrong catalog record, and --title checks the title of the record (R-CITE-005)', async () => {
  fs.writeFileSync(path.join(folder, 'a.md'), 'Words.\n');
  const network = {
    ...io(),
    fetch: services({ 'https://openlibrary.org/': 'openlibrary-wrong-year.json', 'https://doi.org/10.3390/bs9040039': 'doi-journal.json' }),
    today: new Date(2026, 9, 31),
  };
  expect(await run(['source', 'a.md', '9789231007095'], network)).toBe(1);
  expect(err[0]).toMatch(/^9789231007095: error: No catalog has a right record of the ISBN 9789231007095: .* of 1968, but ISBNs of this form exist only since 1970/);
  expect(await run(['source', 'a.md', '10.3390/bs9040039', '--title', 'Self-Concepts in Writing'], network)).toBe(1);
  expect(err[1]).toBe(
    '10.3390/bs9040039: error: The title of the record from doi.org (Crossref), "Self-Concepts in Reading and Spelling among Mono- and Multilingual Children: Extending the Bilingual Advantage", lacks the words of --title "writing", so the record is of another work and nothing is added. Write its line from the source itself.',
  );
  expect(read('a.md')).toBe('Words.\n');
  expect(await run(['source', 'a.md', '10.3390/bs9040039', '--title', 'self-concepts in reading and spelling'], network)).toBe(0);
  expect(out).toContain('10.3390/bs9040039: added festman2019 (article-journal) from doi.org (Crossref)');
  expect(await run(['source', 'a.md', '10.1000/a', '10.1000/b', '--title', 'words'], network)).toBe(2);
  expect(await run(['source', '--search', 'words', '--title', 'words'], network)).toBe(2);
});

const commit = 'c'.repeat(40);
const encoder = new TextEncoder();

/** github is a network that answers as GitHub for one repository with the layout folder `thesis`. */
const github = (asked: string[] = []): Fetcher => {
  const answers: Record<string, string> = {
    'https://api.github.com/search/repositories?q=topic%3Animblescape-markdownpaper-layout&sort=stars&per_page=50': JSON.stringify({ items: [{ full_name: 'school/layouts', default_branch: 'main' }] }),
    'https://api.github.com/repos/school/layouts/commits/main': commit,
    [`https://api.github.com/repos/school/layouts/git/trees/${commit}?recursive=1`]: JSON.stringify({
      tree: ['thesis/layout.json', 'thesis/page.css', 'thesis/document.md', 'thesis/document.pdf', 'thesis/images/folders.svg'].map((file) => ({ path: file, type: 'blob' })),
    }),
    [`https://raw.githubusercontent.com/school/layouts/${commit}/thesis/layout.json`]: JSON.stringify({
      format: 'nimblescape-layout 1.0.0',
      name: 'School thesis',
      language: 'de-AT',
      stylesheets: ['page.css'],
      document: 'document.md',
      preview: 'document.pdf',
      fields: { title: 'Der Titel.', author: 'Der Name.' },
    }),
    [`https://raw.githubusercontent.com/school/layouts/${commit}/thesis/page.css`]: 'p {}',
    [`https://raw.githubusercontent.com/school/layouts/${commit}/thesis/document.md`]: '---\ntitle: "Titel eintragen"\nauthor: "Vorname Nachname"\n---\n\n# Start\n\n![Ordner](images/folders.svg)\n',
    [`https://raw.githubusercontent.com/school/layouts/${commit}/thesis/images/folders.svg`]: '<svg/>',
  };
  return async (url) => {
    asked.push(url);
    const body = answers[url];
    return { status: body === undefined ? 404 : 200, type: 'application/json', url, body: encoder.encode(body ?? '') };
  };
};

test('create without --layout lists the layouts of the folder, the built-in ones and those on GitHub, and copies the chosen one with its empty paper document (R-NEW-004, R-LAY-009)', async () => {
  const lists: string[][] = [];
  const asked: string[] = [];
  const terminal: Io = {
    ...io(['studie', '', 'Mein Titel', '']),
    fetch: github(asked),
    choose: async (_question, choices) => {
      lists.push(choices.map((choice) => `${choice.label} | ${choice.hint ?? ''} | ${choice.detail ?? ''}`));
      return choices.findIndex((choice) => choice.label === 'School thesis');
    },
  };
  expect(await run(['create'], terminal)).toBe(0);
  expect(lists).toEqual([['Plain | plain, built in | ', `School thesis | github:school/layouts/thesis | Preview: https://github.com/school/layouts/blob/${commit}/thesis/document.pdf`]]);
  const paper = read('studie/paper/paper.md');
  expect(paper).toContain('layout: thesis\n');
  expect(paper).toContain('title: "Mein Titel"\n');
  expect(paper).toContain('author: "Vorname Nachname"\n');
  expect(paper).toContain('![Ordner](../images/folders.svg)');
  expect(read('studie/images/folders.svg')).toBe('<svg/>');
  expect(read('studie/layouts/thesis/page.css')).toBe('p {}');
  expect(fs.existsSync(path.join(folder, 'studie/layouts/thesis/document.pdf'))).toBe(false);
  expect(asked.some((url) => url.endsWith('/thesis/document.pdf'))).toBe(false);
});

test('create stops without a file when no layout is chosen, and lists the layouts without GitHub when GitHub fails (R-NEW-004)', async () => {
  const refused: Fetcher = async (url) => ({ status: 403, type: 'application/json', url, body: new Uint8Array() });
  const terminal: Io = { ...io(['studie']), fetch: refused, choose: async () => undefined };
  expect(await run(['create'], terminal)).toBe(2);
  expect(err.join('\n')).toContain('warning: The layouts on GitHub are not in the list: GitHub refused');
  expect(err.join('\n')).toContain('No layout was chosen, so nothing was written.');
  expect(fs.existsSync(path.join(folder, 'studie'))).toBe(false);
});

test('create --layout names a layout on GitHub, and layouts prints the list (R-NEW-004, R-CLI-001)', async () => {
  expect(await run(['create', 'one', '--yes', '--layout', 'github:school/layouts/thesis@main'], { ...io(), fetch: github() })).toBe(0);
  expect(read('one/paper/paper.md')).toContain('layout: thesis\n');
  expect(await run(['create', 'two', '--yes', '--layout', 'github:school'], { ...io(), fetch: github() })).toBe(2);
  out.length = 0;
  expect(await run(['layouts'], { ...io(), fetch: github() })).toBe(0);
  expect(out).toEqual(['plain', '    Plain', 'github:school/layouts/thesis', `    School thesis · de-AT · Preview: https://github.com/school/layouts/blob/${commit}/thesis/document.pdf`]);
});

test('new document copies the files that the empty paper document links to beside the document (R-NEW-001, R-LAY-009)', async () => {
  fs.mkdirSync(path.join(folder, 'layouts/mine/images'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'layouts/mine/layout.json'), JSON.stringify({ format: 'nimblescape-layout 1.0.0', document: 'document.md', preview: 'document.pdf', stylesheets: [] }));
  fs.writeFileSync(path.join(folder, 'layouts/mine/document.md'), '---\ntitle: "Enter the title"\n---\n\n![A](images/a.svg)\n');
  fs.writeFileSync(path.join(folder, 'layouts/mine/images/a.svg'), '<svg/>');
  expect(await run(['new', 'document', 'paper/a.md', '--layout', 'mine'], io())).toBe(0);
  expect(read('paper/a.md')).toContain('title: "Enter the title"\n');
  expect(read('paper/a.md')).toContain('![A](images/a.svg)');
  expect(read('paper/images/a.svg')).toBe('<svg/>');
});

test('preview needs a layout folder with an empty paper document (R-LAY-009)', async () => {
  expect(await run(['preview'], io())).toBe(2);
  expect(await run(['preview', 'nothing'], io())).toBe(2);
  fs.mkdirSync(path.join(folder, 'layouts/bare'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'layouts/bare/layout.json'), JSON.stringify({ format: 'nimblescape-layout 1.0.0' }));
  expect(await run(['preview', 'layouts/bare'], io())).toBe(2);
  expect(err.join('\n')).toContain('The layout "bare" has no empty paper document');
});

test('create writes the origin of a layout on GitHub, and update brings the newer version of its branch and keeps the changes of the project (R-LAY-010)', async () => {
  expect(await run(['create', 'one', '--yes', '--layout', 'github:school/layouts/thesis@main'], { ...io(), fetch: github() })).toBe(0);
  expect(JSON.parse(read('one/layouts/thesis/layout.json')).origin).toEqual({ layout: 'github:school/layouts/thesis', ref: 'main', commit });
  // The newer commit of main changes page.css, adds a font and removes the image.
  const newer = 'd'.repeat(40);
  const base = github();
  const raw = 'https://raw.githubusercontent.com/school/layouts';
  const paths = ['layout.json', 'page.css', 'document.md', 'document.pdf', 'images/folders.svg'];
  const before = new Map(await Promise.all(paths.map(async (file) => [file, (await base(`${raw}/${commit}/thesis/${file}`, '*/*')).body] as const)));
  const after = new Map([...before].filter(([file]) => file !== 'images/folders.svg'));
  after.set('page.css', encoder.encode('p { margin: 0; }'));
  after.set('fonts/a.ttf', encoder.encode('font'));
  const tree = (files: Map<string, Uint8Array>): string => JSON.stringify({ tree: [...files].map(([file, content]) => ({ path: `thesis/${file}`, type: 'blob', sha: blobId(content) })) });
  const answers = new Map<string, Uint8Array>([
    ['https://api.github.com/repos/school/layouts/commits/main', encoder.encode(newer)],
    [`https://api.github.com/repos/school/layouts/commits/${commit}`, encoder.encode(commit)],
    [`https://api.github.com/repos/school/layouts/git/trees/${commit}?recursive=1`, encoder.encode(tree(before))],
    [`https://api.github.com/repos/school/layouts/git/trees/${newer}?recursive=1`, encoder.encode(tree(after))],
    ...[...after].map(([file, content]) => [`${raw}/${newer}/thesis/${file}`, content] as const),
  ]);
  const network: Fetcher = async (url, accept, headers) => {
    const body = answers.get(url);
    return body ? { status: 200, type: 'text/plain', url, body } : base(url, accept, headers);
  };
  const project: Io = { ...io(), cwd: path.join(folder, 'one'), fetch: network };
  fs.appendFileSync(path.join(folder, 'one/layouts/thesis/document.md'), '\nMine.\n');
  fs.writeFileSync(path.join(folder, 'one/layouts/thesis/page.css'), 'p { color: red; }');
  expect(await run(['update', '--check'], project)).toBe(1);
  expect(err.join('\n')).toContain('layouts/thesis: the project and github:school/layouts/thesis@main changed the same files: page.css. Nothing was written');
  fs.writeFileSync(path.join(folder, 'one/layouts/thesis/page.css'), 'p {}');
  expect(await run(['update', '--check'], project)).toBe(1);
  expect(read('one/layouts/thesis/page.css')).toBe('p {}');
  out.length = 0;
  expect(await run(['update'], project)).toBe(0);
  expect(out).toEqual(['layouts/thesis: updated from ccccccc to ddddddd of github:school/layouts/thesis@main: fonts/a.ttf, images/folders.svg, page.css', '  The changes of the project stay in: document.md']);
  expect(read('one/layouts/thesis/page.css')).toBe('p { margin: 0; }');
  expect(read('one/layouts/thesis/fonts/a.ttf')).toBe('font');
  expect(fs.existsSync(path.join(folder, 'one/layouts/thesis/images'))).toBe(false);
  expect(read('one/layouts/thesis/document.md')).toContain('Mine.');
  expect(JSON.parse(read('one/layouts/thesis/layout.json')).origin.commit).toBe(newer);
  out.length = 0;
  expect(await run(['update', 'layouts/thesis'], project)).toBe(0);
  expect(out).toEqual([`layouts/thesis: up to date with github:school/layouts/thesis@main (ddddddd)`]);
  expect(await run(['update'], io())).toBe(2);
});
