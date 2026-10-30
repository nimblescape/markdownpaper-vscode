// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The command markdownpaper ([R-CLI-001](../../docs/requirements.md#r-cli-001)), for people on the command line, for
 * programs and for AI agents. It is the npm package @nimblescape/markdownpaper of cli/:
 *
 * - `pdf <file>` writes the PDF of a Markdown file in its layout, with an installed Chrome, Chromium or Edge.
 * - `check <file>...` checks the front matter of each file against its layout.
 * - `format <file>...` runs the format steps of the paper on each file: the citations and the reference list, and the
 *   lists of the special sections.
 * - `create [folder]` scaffolds a new project, as `npm create vite` does: it asks for the name, the layout from a list
 *   of the layouts of the folder, the built-in layouts and the layouts on GitHub, the language, the title and the
 *   author, or takes them from its options.
 * - `new document|layout|project` writes a new document, a new layout folder, or a new project without questions.
 * - `layouts` lists the layouts that `create` offers, and `preview <folder>` writes the preview PDF of a layout.
 * - `update [folder]...` updates the copies of layouts on GitHub in `layouts/` from their repositories, when the branch
 *   of a copy has a newer version.
 * - `instructions [topic]` prints the rules of a topic for AI agents.
 * - `source <file> <input>...` adds sources to the database of a file, with the metadata of the services that publish
 *   it, and `source --search <words>` lists works of Crossref.
 *
 * The exit code is 0 for success, 1 when `check` found a problem, `format --check` found a file that the format
 * changes, `pdf` wrote the PDF with problems of the document, an input of `source` gave no source, `update` left a
 * copy as it is because the project and the repository changed the same files, or `update --check` found a newer
 * version,
 * and 2 for a wrong command or option, a missing file, a file that exists already, or a PDF that could not be made.
 * The module uses no API of VS Code, and main.ts runs it in Node.js.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { version } from '../../package.json';
import { checkDocument } from '../paper/checks';
import { addSources, sourceLine } from '../paper/citations';
import { citationStyleOf } from '../paper/csl';
import { formatPaper } from '../paper/format';
import { readFrontMatter } from '../paper/frontMatter';
import { topicList, topics } from '../paper/instructions';
import { downloadRemote, findRemote, findRemotes, type Origin, originOf, parseRemote, previewUrl, type RemoteLayout, readOrigin, remoteName } from '../paper/gallery';
import { formatText, type Layout, layoutFile, parseLayout, type Problem } from '../paper/layout';
import { type Fetcher, type Lookup, lookUpFile, lookUpIdentifier, searchWorks } from '../paper/lookup';
import { identifierOf, missingFields } from '../paper/metadata';
import { defaultLayout, documentLayout, findLayout, layoutName } from '../paper/render';
import { mapLinks, type NewFile, newDocumentText, newLayoutFiles, newProjectFiles, packageName, splitStart, startFiles } from '../paper/scaffold';
import { planUpdate } from '../paper/update';
import { type Assets, exportPdf, fileReader, folderUrl } from '../pdf/export';
import { httpFetcher } from './net';

/** command is the name of the command, the `bin` of cli/package.json, as the shell calls it. */
export const command = 'markdownpaper';

/** usage is the help of the tool. */
export const usage = [
  `Usage: ${command} <command> [options]`,
  '',
  'Pages and PDF files from Markdown, in a layout that the repository of the document defines.',
  '',
  'Commands:',
  '  pdf <file.md>                 write the PDF of the file beside it, with the name that its layout gives',
  '      --output <file.pdf>       write the PDF to this file',
  '      --html <file.html>        also write the HTML page of the renderer, for a look at it in a browser',
  '      --browser <program>       the program of Chrome, Chromium or Edge (else MARKDOWNPAPER_BROWSER or a search)',
  '  check <file.md>...            check the front matter against the layout, and the links to figures and tables',
  '  format <file.md>...           write the citations, the reference list and the lists, such as the table of contents',
  '      --check                   write nothing; exit with 1 when the format would change a file',
  '  create [folder]               scaffold a new project; asks for what its options do not give',
  '      --layout <name>           the layout to copy into the project: the name of a folder in layouts/, a built-in',
  '                                layout such as plain, or a layout on GitHub, github:<owner>/<repository>/<folder>',
  '                                with @<branch, tag or commit> if needed; without it, create offers the list',
  '      --language <tag>          the language of the project, for example de-AT or en-US',
  '      --title <text>            the title of the document',
  '      --author <text>           the author of the document',
  '      --yes                     ask nothing: take the defaults',
  '  new document <file.md>        write a new document; --layout <name> names its layout (default: plain)',
  '  new layout <folder>           write a new layout folder, copied from --from <name> (default: plain), --language <tag>',
  '  new project <folder>          write a new project without questions, with the options of create',
  '  layouts                       list the layouts that create offers, with the layouts on GitHub and their previews',
  '  preview <layout folder>       write the preview PDF of a layout: the PDF of its empty paper document',
  '      --write                   also write the formatted empty paper document back into the layout folder',
  '  update [layout folder]...     update a copy of a layout on GitHub from its repository when its branch has a newer',
  '                                version; without a folder, each folder of layouts/ whose layout.json has an origin',
  '      --check                   write nothing; exit with 1 when a layout has a newer version',
  '      --force                   also replace the files that the project changed when the repository changed them',
  '  instructions [topic]          print the rules of a topic for AI agents; without a topic, the list',
  '  source <file.md> <input>...   add sources to the database of the file, with the metadata from doi.org, the library',
  '                                catalogs, PubMed or arXiv; an input is a DOI, an ISBN, a PubMed ID, an arXiv ID, a web',
  '                                address, or a RIS, BibTeX, CSL JSON, HTML or PDF file',
  '      --id <id>                 the ID of the one new source, for example of a law',
  '      --offline                 ask no service; keep the metadata of the files',
  '      --dry-run                 print the new lines of the database and write nothing',
  '  source --search <words>       list up to ten works of Crossref whose title matches, with their DOIs',
  '',
  'Options:',
  '  --help                        show this help',
  '  --version                     show the version of the tool and of the format of the layouts',
  '',
  `Run it without an installation: npx -y ${packageName} <command>`,
].join('\n');

/** Io is what the tool reads and writes besides the files: the streams, the questions, and the files of its package. */
export interface Io {
  /** out writes a line to the standard output, and err to the standard error. */
  out(line: string): void;
  err(line: string): void;
  /** ask asks a question and returns the answer, or undefined when nobody can answer, for example without a terminal. */
  ask?(question: string, answer: string): Promise<string>;
  /** choose shows a list and returns the index of the chosen entry, or undefined when the person stops the choice. */
  choose?(question: string, choices: readonly Choice[], initial: number): Promise<number | undefined>;
  /** cwd is the folder of the relative paths. */
  cwd: string;
  /** assets are the built-in layouts and Paged.js of the package. */
  assets: Assets;
  /** fetch is the network of `source`; without it, the tool sends its own requests. */
  fetch?: Fetcher;
  /** today is the day of the access of a web page; without it, the day of the run. */
  today?: Date;
}

/** Choice is an entry of a list of `create`: its label, a hint after it, and a detail below the list while it is chosen. */
export interface Choice {
  label: string;
  hint?: string;
  detail?: string;
}

/** UsageError is a wrong command or option. */
class UsageError extends Error {}

/**
 * parse splits the arguments into the positional arguments and the options.
 * @param args - The arguments.
 * @param valued - The options that take a value.
 * @param flags - The options without a value.
 */
function parse(args: readonly string[], valued: readonly string[], flags: readonly string[]): { positional: string[]; options: Record<string, string> } {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (flags.includes(name) && inline === undefined) {
      options[name] = 'true';
    } else if (valued.includes(name)) {
      const value = inline ?? args[++index];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new UsageError(`The option --${name} needs a value.`);
      }
      options[name] = value;
    } else {
      throw new UsageError(`Unknown option: ${arg}`);
    }
  }
  return { positional, options };
}

/**
 * describe returns the line of a problem: the file, the line and the message.
 * @param problem - The problem.
 * @param cwd - The folder of the relative paths.
 */
function describe(problem: Problem, cwd: string): string {
  let file = '';
  if (problem.file?.startsWith('file:')) {
    file = path.relative(cwd, new URL(problem.file).pathname.replace(/^\/([A-Za-z]:)/, '$1')) || '.';
  }
  const place = file ? `${file}${problem.line !== undefined ? `:${problem.line + 1}${problem.column !== undefined ? `:${problem.column + 1}` : ''}` : ''}: ` : '';
  return `${place}${problem.severity}: ${problem.message}`;
}

/**
 * readFolder reads the files of a folder and of its subfolders, by their paths in the folder.
 * @param folder - The path of the folder.
 */
export function readFolder(folder: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(folder, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile()) {
        files.set(child, fs.readFileSync(path.join(folder, child)));
      }
    }
  };
  walk('');
  return files;
}

/**
 * writeFiles writes new files into a folder, and none when one of them exists already.
 * @param folder - The path of the folder.
 * @param files - The files.
 * @returns The paths of the written files.
 */
export function writeFiles(folder: string, files: readonly NewFile[]): string[] {
  const existing = files.map((file) => path.join(folder, file.path)).filter((file) => fs.existsSync(file));
  if (existing.length > 0) {
    throw new UsageError(`These files exist already, so nothing was written: ${existing.join(', ')}`);
  }
  return files.map((file) => {
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
    return target;
  });
}

/**
 * layoutAt finds a layout by its name for a file or a folder, and the path of its folder on the disk.
 * @param io - The streams and the assets.
 * @param near - The path of a file in the folder where the search starts.
 * @param name - The name of the layout.
 */
async function layoutAt(io: Io, near: string, name: string): Promise<{ layout: Layout; folder: string }> {
  if (!layoutName.test(name)) {
    throw new UsageError(`The layout "${name}" is no name of a folder: letters, digits, ".", "-" and "_".`);
  }
  const found = await findLayout({ reader: fileReader, builtinLayouts: folderUrl(io.assets.layouts) }, pathToFileURL(near).href, name);
  if (!found.layout) {
    throw new UsageError(found.problems.map((problem) => problem.message).join(' ') || `The layout "${name}" was not found.`);
  }
  return { layout: found.layout, folder: new URL(found.layout.folder).pathname.replace(/^\/([A-Za-z]:)/, '$1') };
}

/**
 * startOf reads the start document of a layout, or returns undefined.
 * @param layout - The layout.
 * @param folder - The path of the folder of the layout.
 */
function startOf(layout: Layout, folder: string): string | undefined {
  return layout.document && fs.existsSync(path.join(folder, layout.document)) ? fs.readFileSync(path.join(folder, layout.document), 'utf8') : undefined;
}

/**
 * Chosen is a layout for a new project: the read layout, its files by their paths in its folder, its empty paper
 * document, and for a layout on GitHub where it comes from.
 */
interface Chosen {
  layout: Layout;
  source: Map<string, Uint8Array>;
  start?: string;
  origin?: Origin;
}

/** token is a token of GitHub from the environment, which raises the limit of the requests to GitHub. */
const token = (): string | undefined => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;

/**
 * fetcherOf returns the network of the tool.
 * @param io - The streams and the network.
 */
const fetcherOf = (io: Io): Fetcher => io.fetch ?? httpFetcher(userAgent);

/**
 * readRemote reads a layout on GitHub with its files.
 * @param io - The streams and the network.
 * @param remote - The layout.
 */
async function readRemote(io: Io, remote: RemoteLayout): Promise<Chosen> {
  io.out(`Reading ${remoteName(remote)} at ${remote.commit.slice(0, 7)} from GitHub …`);
  const source = await downloadRemote(fetcherOf(io), remote);
  const start = remote.layout.document ? source.get(remote.layout.document.replace(/^\.\//, '')) : undefined;
  return { layout: remote.layout, source, origin: originOf(remote), ...(start ? { start: new TextDecoder().decode(start) } : {}) };
}

/**
 * resolveLayout reads a layout by its name for a new project: a layout on GitHub, `github:owner/repository/folder`, a
 * folder in `layouts/` of the folder or above it, or a built-in layout.
 * @param io - The streams, the assets and the network.
 * @param near - The path of a file in the folder where the search starts.
 * @param name - The name of the layout.
 */
async function resolveLayout(io: Io, near: string, name: string): Promise<Chosen> {
  const spec = parseRemote(name);
  if (name.startsWith('github:') && !spec) {
    throw new UsageError(`The layout "${name}" is no layout on GitHub: github:<owner>/<repository>/<folder>, with @<ref> if needed.`);
  }
  if (spec) {
    return readRemote(io, await findRemote(fetcherOf(io), spec, token()));
  }
  const { layout, folder } = await layoutAt(io, near, name);
  const start = startOf(layout, folder);
  return { layout, source: readFolder(folder), ...(start ? { start } : {}) };
}

/** Offer is a layout of the list of `create` and `layouts`: its name for --layout, the entry of the list, and the layout on GitHub, if it is one. */
interface Offer {
  name: string;
  choice: Choice;
  remote?: RemoteLayout;
}

/**
 * offersOf lists the layouts that a new project can copy: the folders of `layouts/` of the current folder, the built-in
 * layouts, and the layouts on GitHub. A failed search on GitHub leaves its layouts out and says why.
 * @param io - The streams, the assets and the network.
 */
async function offersOf(io: Io): Promise<Offer[]> {
  const offers: Offer[] = [];
  const local = (folder: string, hint: (name: string) => string): void => {
    if (!fs.existsSync(folder)) {
      return;
    }
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).filter((candidate) => candidate.isDirectory() && layoutName.test(candidate.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, entry.name, layoutFile);
      if (!offers.some((offer) => offer.name === entry.name) && fs.existsSync(file)) {
        const { layout } = parseLayout(fs.readFileSync(file, 'utf8'), entry.name, folderUrl(path.join(folder, entry.name)));
        offers.push({ name: entry.name, choice: { label: layout?.name ?? entry.name, hint: hint(entry.name) } });
      }
    }
  };
  local(path.join(io.cwd, 'layouts'), (name) => `layouts/${name}`);
  local(io.assets.layouts, (name) => `${name}, built in`);
  io.err('Searching the layouts on GitHub …');
  try {
    const { layouts, problems } = await findRemotes(fetcherOf(io), token());
    for (const problem of problems) {
      io.err(`warning: ${problem}`);
    }
    for (const remote of layouts) {
      const preview = previewUrl(remote);
      offers.push({ name: remoteName(remote), remote, choice: { label: remote.layout.name, hint: remoteName(remote), ...(preview ? { detail: `Preview: ${preview}` } : {}) } });
    }
  } catch (error) {
    io.err(`warning: The layouts on GitHub are not in the list: ${error instanceof Error ? error.message : String(error)}`);
  }
  return offers;
}

/**
 * runPdf runs `pdf`.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runPdf(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, ['output', 'html', 'browser'], []);
  if (positional.length !== 1) {
    throw new UsageError(`${command} pdf needs one Markdown file.`);
  }
  const file = path.resolve(io.cwd, positional[0]);
  if (!fs.existsSync(file)) {
    throw new UsageError(`The file ${positional[0]} does not exist.`);
  }
  const result = await exportPdf(file, {
    assets: io.assets,
    ...(options.output ? { output: path.resolve(io.cwd, options.output) } : {}),
    ...(options.html ? { html: path.resolve(io.cwd, options.html) } : {}),
    ...(options.browser ? { browser: options.browser } : {}),
  });
  for (const problem of result.problems) {
    io.err(describe(problem, io.cwd));
  }
  for (const message of result.messages) {
    io.err(`page: ${message}`);
  }
  io.out(path.relative(io.cwd, result.pdf) || result.pdf);
  return result.problems.length > 0 ? 1 : 0;
}

/**
 * runCheck runs `check`.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runCheck(args: readonly string[], io: Io): Promise<number> {
  const { positional } = parse(args, [], []);
  if (positional.length === 0) {
    throw new UsageError(`${command} check needs at least one Markdown file.`);
  }
  let problems = 0;
  for (const name of positional) {
    const file = path.resolve(io.cwd, name);
    if (!fs.existsSync(file)) {
      throw new UsageError(`The file ${name} does not exist.`);
    }
    const checked = await checkDocument({ reader: fileReader, builtinLayouts: folderUrl(io.assets.layouts) }, pathToFileURL(file).href, fs.readFileSync(file, 'utf8'));
    if (!checked.frontMatter?.values.layout) {
      io.err(`${name}: warning: The file names no layout in its front matter (layout: <name>), so it gets the layout "${defaultLayout}".`);
      problems++;
    }
    for (const problem of checked.problems) {
      io.err(describe(problem, io.cwd));
    }
    problems += checked.problems.length;
  }
  if (problems === 0) {
    io.out(positional.length === 1 ? `${positional[0]}: no problems` : `${positional.length} files: no problems`);
  }
  return problems > 0 ? 1 : 0;
}

/**
 * runFormat runs `format`: the format steps of the paper, which write the lists of the special sections into each file
 * ([R-CLI-002](../../docs/requirements.md#r-cli-002)). The steps of Markdown Notes join when its library is published.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runFormat(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, [], ['check']);
  if (positional.length === 0) {
    throw new UsageError(`${command} format needs at least one Markdown file.`);
  }
  let changed = 0;
  for (const name of positional) {
    const file = path.resolve(io.cwd, name);
    if (!fs.existsSync(file)) {
      throw new UsageError(`The file ${name} does not exist.`);
    }
    const text = fs.readFileSync(file, 'utf8');
    const { layout } = await documentLayout({ reader: fileReader, builtinLayouts: folderUrl(io.assets.layouts) }, pathToFileURL(file).href, readFrontMatter(text));
    const { style } = await citationStyleOf((url) => fileReader.read(url), layout);
    const formatted = formatPaper(text.split(/\r?\n/), layout, style).join(text.includes('\r\n') ? '\r\n' : '\n');
    if (formatted === text) {
      continue;
    }
    changed++;
    if (options.check) {
      io.err(`${name}: warning: The format changes the file; run ${command} format ${name}.`);
    } else {
      fs.writeFileSync(file, formatted);
      io.out(`${name}: formatted`);
    }
  }
  if (changed === 0) {
    io.out(positional.length === 1 ? `${positional[0]}: no change` : `${positional.length} files: no change`);
  }
  return options.check && changed > 0 ? 1 : 0;
}

/** userAgent names the command and its repository in each request of `source`, as the services ask for. */
const userAgent = `${command}/${version} (+https://github.com/nimblescape/markdownpaper-vscode)`;

/**
 * runSource runs `source` ([R-CITE-005](../../docs/requirements.md#r-cite-005)): it looks up each input, adds the new
 * sources to the database of the file, and prints for each input the ID, where the metadata came from, and the fields
 * that the source needs and did not get.
 * @param args - The arguments after the command.
 * @param io - The streams and the network.
 */
async function runSource(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, ['id', 'search'], ['offline', 'dry-run']);
  const fetch = options.offline ? undefined : (io.fetch ?? httpFetcher(userAgent));
  if (options.search !== undefined) {
    if (positional.length > 0 || options.id !== undefined || options['dry-run'] || !fetch) {
      throw new UsageError(`${command} source --search takes only the words of the search.`);
    }
    const { works, problem } = await searchWorks(options.search, fetch);
    if (problem) {
      io.err(`${command}: error: ${problem}.`);
    }
    for (const work of works) {
      io.out(`${work.doi}  ${work.authors || 'no author'} (${work.year ?? 'no date'}). ${work.title}.${work.container ? ` ${work.container}.` : ''} [${work.type}]`);
    }
    if (works.length > 0) {
      io.out(`Add the right one by its DOI: ${command} source <file.md> <DOI>`);
    } else if (!problem) {
      io.err(`${command}: Crossref found no work for "${options.search}".`);
    }
    return works.length > 0 ? 0 : 1;
  }
  if (positional.length < 2) {
    throw new UsageError(`${command} source needs a Markdown file and at least one input: a DOI, an ISBN, a PubMed ID, an arXiv ID, a web address or a file.`);
  }
  if (options.id !== undefined && positional.length > 2) {
    throw new UsageError('--id gives the ID of one new source, so the call can name only one input.');
  }
  const [name, ...inputs] = positional;
  const file = path.resolve(io.cwd, name);
  if (!fs.existsSync(file)) {
    throw new UsageError(`The file ${name} does not exist.`);
  }
  const context = { ...(fetch ? { fetch } : {}), today: io.today ?? new Date() };
  const text = fs.readFileSync(file, 'utf8');
  let lines = text.split(/\r?\n/);
  const newLines: string[] = [];
  let failed = 0;
  for (const input of inputs) {
    const inputFile = path.resolve(io.cwd, input);
    let found: Lookup;
    if (fs.existsSync(inputFile) && fs.statSync(inputFile).isFile()) {
      found = await lookUpFile(input, fs.readFileSync(inputFile), context);
    } else {
      const identifier = identifierOf(input);
      found = identifier
        ? await lookUpIdentifier(identifier, context)
        : { sources: [], from: '', notes: [], problem: 'This is no file and no DOI, ISBN, PubMed ID, arXiv ID or web address.' };
    }
    if (options.id !== undefined && found.sources.length > 1) {
      throw new UsageError(`--id gives the ID of one new source, but ${input} holds ${found.sources.length} sources.`);
    }
    const result = found.sources.length > 0 ? addSources(lines, found.sources, options.id) : undefined;
    const problem = found.problem ?? result?.problem;
    if (!result || problem) {
      failed++;
      io.err(`${input}: error: ${problem ?? 'The input gave no source.'}`);
    } else {
      lines = result.lines;
      newLines.push(...result.added.map(sourceLine));
      for (const source of result.added) {
        io.out(`${input}: added ${source.id} (${source.type ?? 'no type'}) from ${found.from}`);
        const missing = missingFields(source);
        if (missing.length > 0) {
          io.out(`  ${source.id} needs these fields and did not get them: ${missing.join(', ')}. Take them from the source itself, or leave them out.`);
        }
      }
      for (const known of result.known) {
        io.out(`${input}: the database has this source already as ${known.id} (the same ${known.by}); nothing added`);
      }
    }
    for (const note of found.notes) {
      io.out(`  note: ${note}`);
    }
  }
  if (newLines.length > 0) {
    if (options['dry-run']) {
      io.out(`The lines that the database of ${name} would get:`);
      for (const line of newLines) {
        io.out(line);
      }
    } else {
      fs.writeFileSync(file, lines.join(text.includes('\r\n') ? '\r\n' : '\n'));
      io.out(`${name}: ${newLines.length === 1 ? '1 source' : `${newLines.length} sources`} added`);
    }
  }
  return failed > 0 ? 1 : 0;
}

/** ProjectAnswers are the answers for a new project. */
interface ProjectAnswers {
  folder: string;
  layout: Chosen;
  language?: string;
  title: string;
  author: string;
}

/**
 * writeProject writes a new project.
 * @param answers - The answers.
 * @param io - The streams and the assets.
 */
async function writeProject(answers: ProjectAnswers, io: Io): Promise<number> {
  const target = path.resolve(io.cwd, answers.folder);
  const { layout, source, start, origin } = answers.layout;
  const language = answers.language || layout.language;
  const values: Record<string, string> = {};
  if (answers.title) {
    values.title = answers.title;
  }
  if (answers.author) {
    values.author = answers.author;
  }
  const written = writeFiles(target, newProjectFiles({ layout, source, language, values, ...(origin ? { origin } : {}) }, start));
  for (const file of written) {
    io.out(`  ${path.relative(io.cwd, file)}`);
  }
  io.out('');
  io.out(`The project is ready. Next: open ${path.relative(io.cwd, path.join(target, 'paper', 'paper.md'))} in VS Code with nimblescape Markdown Paper, or run:`);
  io.out(`  npx -y ${packageName} pdf ${path.relative(io.cwd, path.join(target, 'paper', 'paper.md'))}`);
  return 0;
}

/**
 * runCreate runs `create`, and `new project` without questions.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 * @param questions - Whether the tool may ask.
 */
async function runCreate(args: readonly string[], io: Io, questions: boolean): Promise<number> {
  const { positional, options } = parse(args, ['layout', 'language', 'title', 'author'], ['yes']);
  if (positional.length > 1) {
    throw new UsageError(`${command} create takes at most one folder.`);
  }
  const ask = questions && options.yes === undefined ? io.ask : undefined;
  const answer = async (question: string, given: string | undefined, fallback: string): Promise<string> =>
    given ?? (ask ? (await ask(question, fallback)).trim() || fallback : fallback);
  const folder = await answer('Name of the project folder', positional[0], 'paper-project');
  if (!folder) {
    throw new UsageError('The project needs a folder.');
  }
  const near = path.join(path.resolve(io.cwd, folder), 'paper', 'paper.md');
  let layout: Chosen;
  if (options.layout === undefined && ask && io.choose) {
    const offers = await offersOf(io);
    const index = await io.choose('Layout', offers.map((offer) => offer.choice), Math.max(0, offers.findIndex((offer) => offer.name === defaultLayout)));
    if (index === undefined) {
      throw new UsageError('No layout was chosen, so nothing was written.');
    }
    const offer = offers[index];
    layout = offer.remote ? await readRemote(io, offer.remote) : await resolveLayout(io, near, offer.name);
  } else {
    layout = await resolveLayout(io, near, await answer('Layout (plain, the name of a folder in layouts/, or github:<owner>/<repository>/<folder>)', options.layout, defaultLayout));
  }
  const language = await answer('Language of the document, for example de-AT or en-US', options.language, '');
  const title = await answer('Title of the document', options.title, '');
  const author = await answer('Author of the document', options.author, '');
  if (language && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(language)) {
    throw new UsageError(`The language "${language}" is no language tag such as de-AT.`);
  }
  return writeProject({ folder, layout, ...(language ? { language } : {}), title, author }, io);
}

/**
 * runNew runs `new document`, `new layout` and `new project`.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runNew(args: readonly string[], io: Io): Promise<number> {
  const [kind, ...rest] = args;
  if (kind === 'project') {
    return runCreate(rest, io, false);
  }
  if (kind === 'document') {
    const { positional, options } = parse(rest, ['layout', 'title', 'author'], []);
    if (positional.length !== 1) {
      throw new UsageError(`${command} new document needs the path of the new Markdown file.`);
    }
    const file = path.resolve(io.cwd, positional[0]);
    const { layout, folder } = await layoutAt(io, file, options.layout ?? defaultLayout);
    const values: Record<string, string> = {};
    for (const key of ['title', 'author'] as const) {
      if (options[key]) {
        values[key] = options[key];
      }
    }
    const start = startOf(layout, folder);
    const written = writeFiles(path.dirname(file), [{ path: path.basename(file), content: newDocumentText(layout, start, values) }, ...startFiles(start, readFolder(folder))]);
    for (const name of written) {
      io.out(path.relative(io.cwd, name));
    }
    return 0;
  }
  if (kind === 'layout') {
    const { positional, options } = parse(rest, ['from', 'language'], []);
    if (positional.length !== 1) {
      throw new UsageError(`${command} new layout needs the path of the new layout folder, for example layouts/my-layout.`);
    }
    const target = path.resolve(io.cwd, positional[0]);
    const name = path.basename(target);
    if (!layoutName.test(name)) {
      throw new UsageError(`The name "${name}" of the layout folder may hold only letters, digits, ".", "-" and "_".`);
    }
    const { folder } = await layoutAt(io, path.join(target, 'layout.json'), options.from ?? defaultLayout);
    const written = writeFiles(target, newLayoutFiles(readFolder(folder), { name, ...(options.language ? { language: options.language } : {}) }));
    for (const file of written) {
      io.out(path.relative(io.cwd, file));
    }
    return 0;
  }
  throw new UsageError(`${command} new needs one of: document, layout, project.`);
}

/**
 * runLayouts runs `layouts`: the list of the layouts that `create` offers, with their names for --layout.
 * @param args - The arguments after the command.
 * @param io - The streams, the assets and the network.
 */
async function runLayouts(args: readonly string[], io: Io): Promise<number> {
  parse(args, [], []);
  for (const offer of await offersOf(io)) {
    io.out(`${offer.name}`);
    io.out(`    ${[offer.choice.label, offer.remote?.layout.language, offer.choice.detail].filter(Boolean).join(' · ')}`);
  }
  return 0;
}

/**
 * runPreview runs `preview`: it makes a project with the empty paper document of a layout in a temporary folder,
 * formats the document, and writes its PDF into the layout folder, with the name of the field `preview`.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runPreview(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, ['browser'], ['write']);
  if (positional.length !== 1) {
    throw new UsageError(`${command} preview needs the path of one layout folder.`);
  }
  const folder = path.resolve(io.cwd, positional[0]);
  const id = path.basename(folder);
  if (!fs.existsSync(path.join(folder, layoutFile))) {
    throw new UsageError(`The folder ${positional[0]} has no ${layoutFile}.`);
  }
  const { layout, problems } = parseLayout(fs.readFileSync(path.join(folder, layoutFile), 'utf8'), id, folderUrl(folder));
  if (!layout) {
    throw new UsageError(problems.map((problem) => problem.message).join(' '));
  }
  const start = startOf(layout, folder);
  if (!start) {
    throw new UsageError(`The layout "${id}" has no empty paper document: the field "document" of ${layoutFile} names it.`);
  }
  const preview = path.join(folder, layout.preview ?? 'document.pdf');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-preview-'));
  try {
    const source = readFolder(folder);
    writeFiles(temporary, newProjectFiles({ layout, source, language: layout.language, values: {} }, start));
    const paper = path.join(temporary, 'paper', 'paper.md');
    const text = fs.readFileSync(paper, 'utf8');
    const host = { reader: fileReader, builtinLayouts: folderUrl(io.assets.layouts) };
    const loaded = await documentLayout(host, pathToFileURL(paper).href, readFrontMatter(text));
    const { style } = await citationStyleOf((url) => fileReader.read(url), loaded.layout);
    const formatted = formatPaper(text.split(/\r?\n/), loaded.layout, style).join('\n');
    fs.writeFileSync(paper, formatted);
    const result = await exportPdf(paper, { assets: io.assets, output: preview, ...(options.browser ? { browser: options.browser } : {}) });
    for (const problem of result.problems) {
      io.err(describe(problem, temporary));
    }
    if (options.write !== undefined) {
      // The document gets back its own front matter, and the links to the files of the layout folder without `../`.
      const linked = new Set(startFiles(start, source).map((file) => file.path));
      const head = start.slice(0, start.indexOf(splitStart(start).body)).trimEnd();
      const back = mapLinks(splitStart(formatted).body, (target) => (target.startsWith('../') && linked.has(target.slice(3)) ? encodeURI(target.slice(3)) : target));
      fs.writeFileSync(path.join(folder, layout.document ?? 'document.md'), `${head ? `${head}\n\n` : ''}${back}\n`);
    }
    if (!layout.preview) {
      io.err(`warning: ${layoutFile} names no preview; add "preview": "${path.basename(preview)}".`);
    }
    io.out(path.relative(io.cwd, preview) || preview);
    return result.problems.length > 0 ? 1 : 0;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * runUpdate runs `update`: it updates each named copy of a layout on GitHub, or each folder of `layouts/` with an
 * origin, from the repository of the layout ([R-LAY-010](../../docs/requirements.md#r-lay-010)).
 * @param args - The arguments after the command.
 * @param io - The streams and the network.
 */
async function runUpdate(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, [], ['check', 'force']);
  let folders = positional.map((folder) => path.resolve(io.cwd, folder));
  if (folders.length === 0) {
    const layouts = path.join(io.cwd, 'layouts');
    const entries = fs.existsSync(layouts) ? fs.readdirSync(layouts, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
    folders = entries.map((entry) => path.join(layouts, entry.name)).filter((folder) => fs.existsSync(path.join(folder, layoutFile)) && readOrigin(fs.readFileSync(path.join(folder, layoutFile), 'utf8')));
    if (folders.length === 0) {
      throw new UsageError(`No folder of ${path.relative(io.cwd, layouts) || 'layouts'}/ is a copy of a layout on GitHub: none has the field "origin" in its ${layoutFile}.`);
    }
  }
  const short = (commit: string): string => commit.slice(0, 7);
  let result = 0;
  for (const folder of folders.sort()) {
    const name = path.relative(io.cwd, folder) || '.';
    if (!fs.existsSync(path.join(folder, layoutFile))) {
      throw new UsageError(`The folder ${name} has no ${layoutFile}.`);
    }
    const update = await planUpdate(fetcherOf(io), readFolder(folder), { ...(token() ? { token: token() } : {}), force: options.force !== undefined });
    const { origin } = update;
    if (update.from === origin.commit || (update.changed.length === 0 && update.conflicts.length === 0 && options.check)) {
      io.out(`${name}: up to date with ${origin.layout}@${origin.ref} (${short(update.from)})`);
      continue;
    }
    if (update.conflicts.length > 0 && options.force === undefined) {
      io.err(`${name}: the project and ${origin.layout}@${origin.ref} changed the same files: ${update.conflicts.join(', ')}. Nothing was written; --force replaces them with the files of ${short(origin.commit)}.`);
      result = 1;
      continue;
    }
    if (options.check) {
      io.out(`${name}: ${origin.layout}@${origin.ref} has a newer version, ${short(origin.commit)}; the update changes ${update.changed.join(', ')}`);
      result = 1;
      continue;
    }
    for (const [file, content] of update.write) {
      fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
      fs.writeFileSync(path.join(folder, file), content);
    }
    for (const file of update.remove) {
      fs.rmSync(path.join(folder, file), { force: true });
      // A folder of the layout that the removed file leaves empty goes too.
      for (let parent = path.dirname(path.join(folder, file)); parent.startsWith(folder + path.sep) && fs.readdirSync(parent).length === 0; parent = path.dirname(parent)) {
        fs.rmdirSync(parent);
      }
    }
    io.out(`${name}: updated from ${short(update.from)} to ${short(origin.commit)} of ${origin.layout}@${origin.ref}: ${update.changed.length > 0 ? update.changed.join(', ') : 'no file of the layout changed'}`);
    if (update.kept.length > 0) {
      io.out(`  The changes of the project stay in: ${update.kept.join(', ')}`);
    }
  }
  return result;
}

/**
 * run runs the tool with the arguments of its command line and returns its exit code.
 * @param args - The arguments, without the program and the script.
 * @param io - The streams, the questions and the assets.
 */
export async function run(args: readonly string[], io: Io): Promise<number> {
  const [name, ...rest] = args;
  try {
    if (name === undefined || name === '--help' || name === '-h' || name === 'help') {
      (name === undefined ? io.err : io.out)(usage);
      return name === undefined ? 2 : 0;
    }
    if (name === '--version') {
      io.out(`${command} ${version} (layouts: ${formatText})`);
      return 0;
    }
    switch (name) {
      case 'pdf':
        return await runPdf(rest, io);
      case 'check':
        return await runCheck(rest, io);
      case 'format':
        return await runFormat(rest, io);
      case 'create':
        return await runCreate(rest, io, true);
      case 'new':
        return await runNew(rest, io);
      case 'source':
        return await runSource(rest, io);
      case 'layouts':
        return await runLayouts(rest, io);
      case 'preview':
        return await runPreview(rest, io);
      case 'update':
        return await runUpdate(rest, io);
      case 'instructions': {
        if (rest.length === 0) {
          io.out(topicList(`npx -y ${packageName}`));
          return 0;
        }
        const topic = topics.find((candidate) => candidate.name === rest[0]);
        if (!topic || rest.length > 1) {
          throw new UsageError(`Unknown topic: ${rest.join(' ')}. The topics: ${topics.map((candidate) => candidate.name).join(', ')}.`);
        }
        io.out(topic.text.trimEnd());
        return 0;
      }
      default:
        throw new UsageError(`Unknown command: ${name}`);
    }
  } catch (error) {
    io.err(`${command}: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) {
      io.err(`Run "${command} --help" for the commands.`);
    }
    return 2;
  }
}
