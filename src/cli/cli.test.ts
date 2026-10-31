// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { version } from '../../package.json';
import type { Fetcher } from '../paper/lookup';
import { blobId } from '../paper/update';
import { type Io, run } from './cli';
import { type Git, gitOf } from './git';

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
  expect(out.join('\n')).toContain('Usage: mp <command> [options]');
  expect(await run(['--version'], io())).toBe(0);
  expect(out.at(-1)).toBe(`mp ${version} (layouts: nimblescape-layout 1.0.0)`);
  expect(await run([], io())).toBe(2);
  expect(await run(['print'], io())).toBe(2);
  expect(err).toContain('mp: Unknown command: print');
  expect(await run(['check', '--fast', 'a.md'], io())).toBe(2);
  expect(err).toContain('mp: Unknown option: --fast');
  // The subcommands pdf and update have new names (R-CLI-004).
  expect(await run(['pdf', 'a.md'], io())).toBe(2);
  expect(err).toContain('mp: mp build writes the PDF now: mp build a.md');
  expect(await run(['update'], io())).toBe(2);
  expect(err).toContain('mp: mp get updates the copies of layouts now, with the clones of the references.');
});

test('create asks for what its options do not give, and writes the project (R-NEW-003)', async () => {
  expect(await run(['create', '--title', 'Agenten'], io(['studie', '', 'de-AT', 'Hannes Stauss']))).toBe(0);
  expect(read('studie/paper/paper.md')).toContain('title: "Agenten"\n');
  expect(read('studie/paper/paper.md')).toContain('author: "Hannes Stauss"\n');
  expect(JSON.parse(read('studie/layouts/plain/layout.json')).language).toBe('de-AT');
  expect(fs.existsSync(path.join(folder, 'studie/inbox/.gitkeep'))).toBe(true);
  expect(fs.existsSync(path.join(folder, 'studie/bib/.gitkeep'))).toBe(true);
  expect(read('studie/AGENTS.md')).toContain('Process each file in `inbox/`');
  expect(read('studie/AGENTS.md')).toContain('npx -y @nimblescape/markdownpaper build paper/paper.md');
  expect(read('studie/AGENTS.md')).not.toContain(' get ');
});

test('create with --yes and new project ask nothing, and write no file over an existing one (R-NEW-003)', async () => {
  expect(await run(['create', 'one', '--yes'], io(['never']))).toBe(2);
  expect(err.at(-2)).toBe(
    'mp: mp create needs a layout: --layout <owner>/<repository>/<folder>@<rev> for a layout on GitHub, or the name of a folder in layouts/ or of a built-in layout such as plain; "mp layouts" lists them.',
  );
  expect(fs.existsSync(path.join(folder, 'one'))).toBe(false);
  expect(await run(['create', 'one', '--yes', '--layout', 'plain'], io(['never']))).toBe(0);
  expect(read('one/paper/paper.md')).toContain('layout: plain\n');
  expect(await run(['new', 'project', 'one', '--layout', 'plain'], io())).toBe(2);
  expect(err.join('\n')).toContain('exist already, so nothing was written');
  expect(await run(['new', 'project', 'two', '--layout', 'plain', '--language', 'English'], io())).toBe(2);
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
  expect(err).toEqual(['a.md: warning: The format changes the file; run mp format a.md.']);
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

test('build needs one file that exists (R-PDF-001)', async () => {
  expect(await run(['build'], io())).toBe(2);
  expect(await run(['build', 'missing.md'], io())).toBe(2);
  expect(err).toContain('mp: The file missing.md does not exist.');
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
  expect(out.at(-1)).toBe('Add the right one by its DOI: mp source <file.md> <DOI>');
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

/** remotes is a folder of repositories that Git reaches in place of https://github.com/ in the tests of get and create. */
let remotes: string;

/** git runs Git with the repositories of `remotes` in place of those of GitHub. */
let git: Git;

beforeEach(() => {
  remotes = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-remotes-'));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${pathToFileURL(remotes).href}/.insteadOf`, GIT_CONFIG_VALUE_0: 'https://github.com/' };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  git = gitOf(env, false);
});

afterEach(() => {
  fs.rmSync(remotes, { recursive: true, force: true });
});

/**
 * commitTo writes files into a repository of `remotes`, which it makes when it is missing, and commits them on the
 * branch main, with a tag if one is given.
 * @param repository - The owner and the name of the repository.
 * @param files - The files by their paths, and undefined for a file to remove.
 * @param tag - The tag of the commit.
 * @returns The commit.
 */
async function commitTo(repository: string, files: Record<string, string | undefined>, tag?: string): Promise<string> {
  const work = path.join(remotes, `${repository}.git`);
  if (!fs.existsSync(work)) {
    fs.mkdirSync(work, { recursive: true });
    await git(['init', '--quiet', '--initial-branch=main'], work);
  }
  for (const [file, content] of Object.entries(files)) {
    if (content === undefined) {
      fs.rmSync(path.join(work, file));
    } else {
      fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), content);
    }
  }
  await git(['add', '--all'], work);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '--quiet', '-m', 'files'], work);
  if (tag) {
    await git(['tag', tag], work);
  }
  return (await git(['rev-parse', 'HEAD'], work)).trim();
}

/** thesisFiles are the files of the layout folder thesis of school/layouts. */
const thesisFiles = {
  'thesis/layout.json': JSON.stringify({
    format: 'nimblescape-layout 1.0.0',
    name: 'School thesis',
    language: 'de-AT',
    stylesheets: ['page.css'],
    document: 'document.md',
    preview: 'document.pdf',
    fields: { title: 'Der Titel.', author: 'Der Name.' },
  }),
  'thesis/page.css': 'p {}',
  'thesis/document.md': '---\ntitle: "Titel eintragen"\nauthor: "Vorname Nachname"\n---\n\n# Start\n\n![Ordner](images/folders.svg)\n',
  'thesis/document.pdf': '%PDF',
  'thesis/images/folders.svg': '<svg/>',
};

test('create without --layout lists the layouts of the folder, the built-in ones and those on GitHub, and clones the chosen one with its reference (R-NEW-004, R-LAY-009, R-CLI-004)', async () => {
  await commitTo('school/layouts', thesisFiles);
  const lists: string[][] = [];
  const asked: string[] = [];
  const terminal: Io = {
    ...io(['studie', '', 'Mein Titel', '']),
    fetch: github(asked),
    git,
    choose: async (_question, choices) => {
      lists.push(choices.map((choice) => `${choice.label} | ${choice.hint ?? ''} | ${choice.detail ?? ''}`));
      return choices.findIndex((choice) => choice.label === 'School thesis');
    },
  };
  expect(await run(['create'], terminal)).toBe(0);
  expect(lists).toEqual([['Plain | plain, built in | ', `School thesis | school/layouts/thesis | Preview: https://github.com/school/layouts/blob/${commit}/thesis/document.pdf`]]);
  const paper = read('studie/paper/paper.md');
  expect(paper).toContain('layout: school/layouts/thesis@main\n');
  expect(paper).toContain('title: "Mein Titel"\n');
  expect(paper).toContain('author: "Vorname Nachname"\n');
  expect(paper).toContain('![Ordner](../images/folders.svg)');
  expect(read('studie/images/folders.svg')).toBe('<svg/>');
  // The layout stays in its clone, which Git ignores; the project holds no copy.
  expect(read('studie/.markdownpaper/repos/layouts/thesis/page.css')).toBe('p {}');
  expect(read('studie/.markdownpaper/.gitignore')).toBe('*\n');
  expect(fs.readdirSync(path.join(folder, 'studie')).sort()).toEqual(['.markdownpaper', 'AGENTS.md', 'bib', 'images', 'inbox', 'paper']);
  expect(read('studie/AGENTS.md')).toContain('| `.markdownpaper/repos/layouts/thesis/` | The layout of the pages');
  expect(read('studie/AGENTS.md')).toContain('npx -y @nimblescape/markdownpaper get ');
  // The list reads layout.json from GitHub; the files of the layout come from the clone.
  expect(asked.some((url) => url.endsWith('/thesis/page.css') || url.endsWith('/thesis/document.md'))).toBe(false);
  out.length = 0;
  expect(await run(['check', 'studie/paper/paper.md'], io())).toBe(0);
  expect(out).toEqual(['studie/paper/paper.md: no problems']);
});

test('create stops without a file when no layout is chosen, and lists the layouts without GitHub when GitHub fails (R-NEW-004)', async () => {
  const refused: Fetcher = async (url) => ({ status: 403, type: 'application/json', url, body: new Uint8Array() });
  const terminal: Io = { ...io(['studie']), fetch: refused, choose: async () => undefined };
  expect(await run(['create'], terminal)).toBe(2);
  expect(err.join('\n')).toContain('warning: The layouts on GitHub are not in the list: GitHub refused');
  expect(err.join('\n')).toContain('No layout was chosen, so nothing was written.');
  expect(fs.existsSync(path.join(folder, 'studie'))).toBe(false);
});

test('create --layout names a layout on GitHub, a failed clone leaves no folder, and layouts prints the list (R-NEW-004, R-CLI-001, R-CLI-004)', async () => {
  await commitTo('school/layouts', thesisFiles, 'v1.0.0');
  expect(await run(['create', 'one', '--yes', '--layout', 'school/layouts/thesis@v1.0.0', '--language', 'en-GB'], { ...io(), git })).toBe(0);
  expect(read('one/paper/paper.md')).toContain('layout: school/layouts/thesis@v1.0.0\n');
  expect(read('one/paper/paper.md')).toContain('lang: "en-GB"\n');
  expect(await run(['create', 'two', '--yes', '--layout', 'school/layouts/thesis@v9'], { ...io(), git })).toBe(2);
  expect(err.join('\n')).toContain('school/layouts has no branch, tag or commit "v9".');
  expect(await run(['create', 'two', '--yes', '--layout', 'school/layouts/concept'], { ...io(), git })).toBe(2);
  expect(err.join('\n')).toContain('school/layouts has no layout in the folder concept: the layout.json is missing.');
  expect(fs.existsSync(path.join(folder, 'two'))).toBe(false);
  expect(await run(['create', 'three', '--yes', '--layout', 'github:school'], { ...io(), git })).toBe(2);
  out.length = 0;
  expect(await run(['layouts'], { ...io(), fetch: github() })).toBe(0);
  expect(out).toEqual(['plain', '    Plain', 'school/layouts/thesis@main', `    School thesis · de-AT · Preview: https://github.com/school/layouts/blob/${commit}/thesis/document.pdf`]);
});

test('get clones the repositories that the papers name, follows the branches, keeps the pins, and moves the tags with -u (R-CLI-004)', async () => {
  const v1 = await commitTo('school/layouts', thesisFiles, 'v1.0.0');
  const server = await commitTo('org/server', { 'src/api.ts': 'export const a = 1;\n' });
  fs.mkdirSync(path.join(folder, '.git'));
  fs.mkdirSync(path.join(folder, 'paper'));
  const text = '---\nlayout: school/layouts/thesis@v1.0.0\ntitle: "T"\nrepos:\n  server: org/server@main\n---\n\n# Start\n';
  fs.writeFileSync(path.join(folder, 'paper/paper.md'), text);
  fs.writeFileSync(path.join(folder, 'notes.md'), '# Notes without a front matter\n');
  const project: Io = { ...io(), cwd: path.join(folder, 'paper'), git };
  // Without the clones, the layout and the repository are missing.
  expect(await run(['check', 'paper.md'], project)).toBe(1);
  expect(err.join('\n')).toContain('paper.md:2:1: error: The layout school/layouts/thesis@v1.0.0 is not in .markdownpaper/repos/ of the project yet: run "mp get" in the folder of the project.');
  expect(err.join('\n')).toContain('paper.md:5:11: warning: The repository org/server@main of "server" is not in .markdownpaper/repos/ of the project yet');
  err.length = 0;
  expect(await run(['get'], project)).toBe(0);
  expect(out).toEqual([`layouts: school/layouts@v1.0.0 at ${v1.slice(0, 7)} (new clone)`, `server: org/server@main at ${server.slice(0, 7)} (new clone)`]);
  expect(read('.markdownpaper/repos/server/src/api.ts')).toBe('export const a = 1;\n');
  expect(read('.markdownpaper/repos/server/.git/HEAD').trim()).toBe(server);
  expect(read('.markdownpaper/.gitignore')).toBe('*\n');
  expect(await run(['check', 'paper.md'], project)).toBe(0);

  // A new commit of main and a new tag: get follows the branch and keeps the tag; -u moves the tag.
  const next = await commitTo('org/server', { 'src/api.ts': 'export const a = 2;\n' });
  const v2 = await commitTo('school/layouts', { 'thesis/page.css': 'p { margin: 0; }' }, 'v1.1.0');
  out.length = 0;
  expect(await run(['get'], project)).toBe(0);
  expect(out).toEqual([`layouts: school/layouts@v1.0.0 at ${v1.slice(0, 7)} (up to date)`, `server: org/server@main at ${next.slice(0, 7)} (from ${server.slice(0, 7)})`]);
  expect(read('paper/paper.md')).toBe(text);
  out.length = 0;
  expect(await run(['get', '-u'], project)).toBe(0);
  expect(out).toEqual([
    `layouts: school/layouts@v1.1.0 at ${v2.slice(0, 7)} (from ${v1.slice(0, 7)})`,
    '  paper.md: layout from @v1.0.0 to @v1.1.0',
    `server: org/server@main at ${next.slice(0, 7)} (up to date)`,
  ]);
  expect(read('paper/paper.md')).toBe(text.replace('@v1.0.0', '@v1.1.0'));
  expect(read('.markdownpaper/repos/layouts/thesis/page.css')).toBe('p { margin: 0; }');

  // get with a reference writes it into repos; the default branch is its rev without @.
  const tools = await commitTo('org/tools', { 'README.md': '# Tools\n' });
  out.length = 0;
  expect(await run(['get', 'org/tools', '--name', 'helpers'], project)).toBe(0);
  expect(out).toEqual([`helpers: org/tools@main at ${tools.slice(0, 7)} (new clone)`, 'paper.md: helpers: org/tools@main']);
  expect(read('paper/paper.md')).toContain('repos:\n  server: org/server@main\n  helpers: org/tools@main\n---\n');
  expect(await run(['get', `org/server@${server}`], project)).toBe(0);
  expect(read('paper/paper.md')).toContain(`  server: org/server@${server}\n`);
  expect(read('.markdownpaper/repos/server/src/api.ts')).toBe('export const a = 1;\n');
  expect(await run(['get', 'org/other@main', '--name', 'server'], project)).toBe(2);
  expect(err.at(-2)).toBe(`mp: paper.md names org/server@${server} as "server" already; --name gives the new reference another name.`);
  expect(await run(['get', 'org/server/src@main'], project)).toBe(2);

  // A clone with changes stays as it is.
  fs.writeFileSync(path.join(folder, '.markdownpaper/repos/helpers/README.md'), '# Changed\n');
  err.length = 0;
  expect(await run(['get'], project)).toBe(2);
  expect(err.join('\n')).toContain('helpers: error: The clone ');
  expect(read('.markdownpaper/repos/helpers/README.md')).toBe('# Changed\n');
});

test('get finds two papers that give one clone two revs, and needs the paper for a new reference (R-CLI-004)', async () => {
  await commitTo('org/server', { 'a.txt': 'a' }, 'v1');
  fs.writeFileSync(path.join(folder, 'a.md'), '---\nlayout: plain\nrepos:\n  server: org/server@v1\n---\n');
  fs.writeFileSync(path.join(folder, 'b.md'), '---\nlayout: plain\nrepos:\n  server: org/server@main\n  bad: nothing\n---\n');
  expect(await run(['get'], { ...io(), git })).toBe(2);
  expect(err).toEqual([
    'b.md:5:8: error: The reference "nothing" of bad is no reference to a repository on GitHub: <owner>/<repository>@<rev>.',
    'b.md:4:11: error: "server" is org/server@main here and org/server@v1 in a.md; one clone has one rev, so the second one gets another name.',
  ]);
  expect(out).toEqual(['server: org/server@v1 at ' + (await git(['rev-parse', 'HEAD'], path.join(remotes, 'org/server.git'))).trim().slice(0, 7) + ' (new clone)']);
  expect(await run(['get', 'org/tools'], { ...io(), git })).toBe(2);
  expect(err.at(-2)).toBe('mp: The project has 2 papers; name the one that gets the reference: mp get org/tools <file.md>');
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

test('get updates a copy of a layout on GitHub from the newer version of its branch and keeps the changes of the project (R-LAY-010)', async () => {
  // A copy of the layout thesis at the commit c…, with the origin of an older copy that has github: before its name.
  const raw = 'https://raw.githubusercontent.com/school/layouts';
  const base = github();
  const paths = ['layout.json', 'page.css', 'document.md', 'document.pdf', 'images/folders.svg'];
  const before = new Map(await Promise.all(paths.map(async (file) => [file, (await base(`${raw}/${commit}/thesis/${file}`, '*/*')).body] as const)));
  const copy = path.join(folder, 'one/layouts/thesis');
  for (const [file, content] of before) {
    fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
    fs.writeFileSync(path.join(copy, file), content);
  }
  const json = JSON.parse(new TextDecoder().decode(before.get('layout.json')));
  fs.writeFileSync(path.join(copy, 'layout.json'), JSON.stringify({ ...json, origin: { layout: 'github:school/layouts/thesis', ref: 'main', commit } }, null, 2));
  // The newer commit of main changes page.css, adds a font and removes the image.
  const newer = 'd'.repeat(40);
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
  const project: Io = { ...io(), cwd: path.join(folder, 'one'), fetch: network, git };
  fs.appendFileSync(path.join(copy, 'document.md'), '\nMine.\n');
  fs.writeFileSync(path.join(copy, 'page.css'), 'p { color: red; }');
  expect(await run(['get'], project)).toBe(1);
  expect(err.join('\n')).toContain('layouts/thesis: the project and school/layouts/thesis@main changed the same files: page.css. Nothing was written');
  expect(read('one/layouts/thesis/page.css')).toBe('p { color: red; }');
  fs.writeFileSync(path.join(copy, 'page.css'), 'p {}');
  out.length = 0;
  expect(await run(['get'], project)).toBe(0);
  expect(out).toEqual(['layouts/thesis: updated from ccccccc to ddddddd of school/layouts/thesis@main: fonts/a.ttf, images/folders.svg, page.css', '  The changes of the project stay in: document.md']);
  expect(read('one/layouts/thesis/page.css')).toBe('p { margin: 0; }');
  expect(read('one/layouts/thesis/fonts/a.ttf')).toBe('font');
  expect(fs.existsSync(path.join(copy, 'images'))).toBe(false);
  expect(read('one/layouts/thesis/document.md')).toContain('Mine.');
  expect(JSON.parse(read('one/layouts/thesis/layout.json')).origin.commit).toBe(newer);
  out.length = 0;
  expect(await run(['get'], project)).toBe(0);
  expect(out).toEqual([`layouts/thesis: up to date with school/layouts/thesis@main (ddddddd)`]);
  out.length = 0;
  expect(await run(['get'], { ...io(), git })).toBe(0);
  expect(out).toEqual(['No paper of the project names a repository on GitHub, and no folder layouts/ has a copy of a layout on GitHub.']);
});
