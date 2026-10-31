// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The command mp ([R-CLI-001](../../docs/requirements.md#r-cli-001)), for people on the command line, for programs and
 * for AI agents. It is the npm package @nimblescape/markdownpaper of cli/:
 *
 * - `build <file>` writes the PDF of a Markdown file in its layout, with an installed Chrome, Chromium or Edge.
 * - `check <file>...` checks the front matter of each file against its layout.
 * - `format <file>...` runs the format steps of the paper on each file: the citations and the reference list, and the
 *   lists of the special sections.
 * - `create [folder]` scaffolds a new project, as `npm create vite` does: it asks for the name, the layout from a list
 *   of the layouts of the folder, the built-in layouts and the layouts on GitHub, the language, the title and the
 *   author, or takes them from its options. A layout on GitHub stays in its clone, and the document names its
 *   reference ([R-CLI-004](../../docs/requirements.md#r-cli-004)).
 * - `new document|layout|project` writes a new document, a new layout folder, or a new project without questions.
 * - `layouts` lists the layouts that `create` offers, and `preview <folder>` writes the preview PDF of a layout.
 * - `get` clones the repositories that the papers of the project name into `.markdownpaper/repos/`, or fetches into
 *   their clones, and updates the copies of layouts on GitHub in `layouts/` from their repositories; `get
 *   <owner>/<repository>@<rev>` writes a reference into the field `repos` of a paper
 *   ([R-CLI-004](../../docs/requirements.md#r-cli-004)).
 * - `instructions [topic]` prints the rules of a topic for AI agents.
 * - `source <file> <input>...` adds sources to the database of a file, with the metadata of the services that publish
 *   it, and `source --search <words>` lists works of Crossref.
 *
 * The exit code is 0 for success, 1 when `check` found a problem, `format --check` found a file that the format
 * changes, `build` wrote the PDF with problems of the document, an input of `source` gave no source, or `get` left a
 * copy of a layout as it is because the project and the repository changed the same files, and 2 for a wrong command
 * or option, a missing file, a file that exists already, a failure of Git, or a PDF that could not be made.
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
import { findRemotes, parseRemote, previewUrl, type RemoteSpec, readOrigin, referenceText, remoteName } from '../paper/gallery';
import { formatText, type Layout, layoutFile, layoutName, parseLayout, type Problem } from '../paper/layout';
import { type Fetcher, type Lookup, lookUpFile, lookUpIdentifier, searchWorks, titleProblem } from '../paper/lookup';
import { identifierOf, missingFields } from '../paper/metadata';
import { cloneName, clonesFolder, type Reference, referencesOf, setReference } from '../paper/references';
import { defaultLayout, documentLayout, findLayout } from '../paper/render';
import { mapLinks, type NewFile, newDocumentText, newLayoutFiles, newProjectFiles, packageName, splitStart, startFiles } from '../paper/scaffold';
import { planUpdate } from '../paper/update';
import { defaultPlace, downloadBrowser, downloadSize, type Place } from '../pdf/download';
import { type Assets, exportPdf, fileReader, folderUrl } from '../pdf/export';
import { type Git, GitError, getClone, gitOf } from './git';
import { httpFetcher } from './net';

/** command is the name of the command, the `bin` of cli/package.json, as the shell calls it. */
export const command = 'mp';

/** usage is the help of the tool. */
export const usage = [
  `Usage: ${command} <command> [options]`,
  '',
  'Pages and PDF files from Markdown, in a layout that the repository of the document defines.',
  '',
  'Commands:',
  '  build <file.md>               write the PDF of the file beside it, with the name that its layout gives',
  '      --output <file.pdf>       write the PDF to this file',
  '      --html <file.html>        also write the HTML page of the renderer, for a look at it in a browser',
  '      --browser <program>       the program of Chrome, Chromium or Edge (else MARKDOWNPAPER_BROWSER or a search)',
  '      --download-browser        download Chromium once into the cache of the user when no browser is installed',
  '  check <file.md>...            check the front matter against the layout, and the links to figures and tables',
  '  format <file.md>...           write the citations, the reference list and the lists, such as the table of contents',
  '      --check                   write nothing; exit with 1 when the format would change a file',
  '  create [folder]               scaffold a new project; asks for what its options do not give',
  '      --layout <name>           the layout of the project: a layout on GitHub, <owner>/<repository>/<folder>@<rev>',
  '                                with a branch, a tag or a commit as the rev, which the document names and get',
  '                                clones; or the name of a folder in layouts/ or of a built-in layout such as plain,',
  '                                which the project copies; without it, create offers the list in a terminal',
  '      --language <tag>          the language of the project, for example de-AT or en-US',
  '      --title <text>            the title of the document',
  '      --author <text>           the author of the document',
  '      --yes                     ask nothing: take the defaults; --layout is still needed',
  '  new document <file.md>        write a new document; --layout <name> names its layout (default: plain)',
  '  new layout <folder>           write a new layout folder, copied from --from <name> (default: plain), --language <tag>',
  '  new project <folder>          write a new project without questions, with the options of create',
  '  layouts                       list the layouts that create offers, with the layouts on GitHub and their previews',
  '  preview <layout folder>       write the preview PDF of a layout: the PDF of its empty paper document',
  '      --write                   also write the formatted empty paper document back into the layout folder',
  '  get [<file.md>...]            clone the repositories that the papers name (their layouts and the field repos) into',
  '                                .markdownpaper/repos/, pull the heads of their branches, and update the copies of',
  '                                layouts on GitHub in layouts/; without a file, each paper of the project',
  '      -u                        also move each reference to a tag to the newest tag of its repository',
  '      --force                   also replace the files of a copy that the project changed when the repository did',
  '  get <owner>/<repository>[@<rev>] [<file.md>]',
  '                                write the reference into the field repos of the paper and clone the repository; the',
  '                                rev is a branch, a tag or a commit, and the default branch without it',
  '      --name <name>             the name of the reference (default: the name of the repository)',
  '  instructions [topic]          print the rules of a topic for AI agents; without a topic, the list',
  '  source <file.md> <input>...   add sources to the database of the file, with the metadata from doi.org, the library',
  '                                catalogs, PubMed or arXiv; an input is a DOI, an ISBN, a PubMed ID, an arXiv ID, a web',
  '                                address, or a RIS, BibTeX, CSL JSON, HTML or PDF file',
  '      --id <id>                 the ID of the one new source, for example of a law',
  '      --title <words>           words of the title of the one source, from the source itself; a record whose title',
  '                                lacks one of them adds nothing',
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
  /** place is the place of the download of Chromium; without it, the cache of the user. */
  place?: Place;
  /** git runs Git for `get` and `create`; without it, the program git. */
  git?: Git;
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
      if (entry.isDirectory() && entry.name === '.git') {
        continue;
      }
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
 * layoutAt finds a layout by its name for a file or a folder, also a layout on GitHub in its clone, and the path of its
 * folder on the disk.
 * @param io - The streams and the assets.
 * @param near - The path of a file in the folder where the search starts.
 * @param name - The name of the layout.
 */
async function layoutAt(io: Io, near: string, name: string): Promise<{ layout: Layout; folder: string }> {
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
 * document, and for a layout on GitHub its reference with the rev of its clone.
 */
interface Chosen {
  layout: Layout;
  source: Map<string, Uint8Array>;
  start?: string;
  reference?: RemoteSpec;
}

/** token is a token of GitHub from the environment, which raises the limit of the requests to GitHub. */
const token = (): string | undefined => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;

/**
 * fetcherOf returns the network of the tool.
 * @param io - The streams and the network.
 */
const fetcherOf = (io: Io): Fetcher => io.fetch ?? httpFetcher(userAgent);

/**
 * cloneLayout clones a layout on GitHub into `.markdownpaper/repos/` of a project and reads it from its clone
 * ([R-CLI-004](../../docs/requirements.md#r-cli-004)). The reference gets the rev of the clone, the default branch
 * when it names none.
 * @param io - The streams and Git.
 * @param project - The folder of the project.
 * @param spec - The reference of the layout.
 */
async function cloneLayout(io: Io, project: string, spec: RemoteSpec): Promise<Chosen> {
  const clone = path.join(project, clonesFolder, cloneName(spec));
  io.out(`Cloning ${referenceText(spec)} into ${path.relative(io.cwd, clone) || clone} …`);
  const got = await getClone(io.git ?? gitOf(), clone, spec);
  const folder = path.join(clone, spec.folder);
  const file = path.join(folder, layoutFile);
  if (!fs.existsSync(file)) {
    throw new UsageError(`${spec.repository} has no layout${spec.folder ? ` in the folder ${spec.folder}` : ' at its root'}: the ${layoutFile} is missing.`);
  }
  const { layout, problems } = parseLayout(fs.readFileSync(file, 'utf8'), spec.folder.split('/').pop() || cloneName(spec), folderUrl(folder));
  if (!layout) {
    throw new UsageError(problems.map((problem) => problem.message).join(' '));
  }
  const start = startOf(layout, folder);
  return { layout, source: readFolder(folder), reference: { ...spec, ref: got.rev }, ...(start ? { start } : {}) };
}

/**
 * resolveLayout reads a layout by its name for a new project: a layout on GitHub, `owner/repository/folder@rev`, in
 * its clone in the project, a folder in `layouts/` of the folder or above it, or a built-in layout.
 * @param io - The streams, the assets and Git.
 * @param project - The folder of the project.
 * @param near - The path of a file in the folder where the search starts.
 * @param name - The name of the layout.
 */
async function resolveLayout(io: Io, project: string, near: string, name: string): Promise<Chosen> {
  if (name.includes('/')) {
    const spec = parseRemote(name);
    if (!spec) {
      throw new UsageError(`The layout "${name}" is no layout on GitHub: <owner>/<repository>/<folder>@<rev>.`);
    }
    return cloneLayout(io, project, spec);
  }
  const { layout, folder } = await layoutAt(io, near, name);
  const start = startOf(layout, folder);
  return { layout, source: readFolder(folder), ...(start ? { start } : {}) };
}

/** Offer is a layout of the list of `create` and `layouts`: its name for --layout, the entry of the list, and the reference of a layout on GitHub. */
interface Offer {
  name: string;
  choice: Choice;
  remote?: RemoteSpec;
  language?: string;
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
      const spec = { repository: remote.repository, folder: remote.folder, ref: remote.ref };
      offers.push({ name: referenceText(spec), remote: spec, language: remote.layout.language, choice: { label: remote.layout.name, hint: remoteName(remote), ...(preview ? { detail: `Preview: ${preview}` } : {}) } });
    }
  } catch (error) {
    io.err(`warning: The layouts on GitHub are not in the list: ${error instanceof Error ? error.message : String(error)}`);
  }
  return offers;
}

/**
 * downloadChromium downloads Chromium once into the cache of the user for the PDF, when no browser is installed
 * ([R-PDF-002](../../docs/requirements.md#r-pdf-002)), and says so on the standard error.
 * @param io - The streams and the network.
 */
async function downloadChromium(io: Io): Promise<string> {
  const place = io.place ?? defaultPlace();
  const size = downloadSize(place);
  io.err(`No browser is installed: downloading Chromium ${place.release.version}${size ? ` (about ${size} MB)` : ''} into ${place.cache} …`);
  return downloadBrowser(fetcherOf(io), place);
}

/**
 * runBuild runs `build`: the PDF of a document.
 * @param args - The arguments after the command.
 * @param io - The streams and the assets.
 */
async function runBuild(args: readonly string[], io: Io): Promise<number> {
  const { positional, options } = parse(args, ['output', 'html', 'browser'], ['download-browser']);
  if (positional.length !== 1) {
    throw new UsageError(`${command} build needs one Markdown file.`);
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
    ...(options['download-browser'] ? { download: () => downloadChromium(io) } : {}),
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
      io.err(`${name}: warning: The file names no layout in its front matter (layout: <name or reference>), so it gets the layout "${defaultLayout}".`);
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
  const { positional, options } = parse(args, ['id', 'search', 'title'], ['offline', 'dry-run']);
  const fetch = options.offline ? undefined : (io.fetch ?? httpFetcher(userAgent));
  if (options.search !== undefined) {
    if (positional.length > 0 || options.id !== undefined || options.title !== undefined || options['dry-run'] || !fetch) {
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
  if (options.title !== undefined && positional.length > 2) {
    throw new UsageError('--title gives words of the title of one source, so the call can name only one input.');
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
    if (options.title !== undefined && found.sources.length > 1) {
      throw new UsageError(`--title gives words of the title of one source, but ${input} holds ${found.sources.length} sources.`);
    }
    const wrongTitle = options.title !== undefined && found.sources.length === 1 ? titleProblem(found.sources[0], found.from, options.title) : undefined;
    if (wrongTitle) {
      found = { ...found, sources: [], notes: [], problem: wrongTitle };
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
  const { layout, source, start, reference } = answers.layout;
  const language = answers.language || layout.language;
  const values: Record<string, string> = {};
  if (answers.title) {
    values.title = answers.title;
  }
  if (answers.author) {
    values.author = answers.author;
  }
  const written = writeFiles(target, newProjectFiles({ layout, source, language, values, ...(reference ? { reference } : {}) }, start));
  for (const file of written) {
    io.out(`  ${path.relative(io.cwd, file)}`);
  }
  io.out('');
  io.out(`The project is ready. Next: open ${path.relative(io.cwd, path.join(target, 'paper', 'paper.md'))} in VS Code with nimblescape Markdown Paper, or run:`);
  io.out(`  ${command} build ${path.relative(io.cwd, path.join(target, 'paper', 'paper.md'))}`);
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
  const project = path.resolve(io.cwd, folder);
  const near = path.join(project, 'paper', 'paper.md');
  if (options.layout === undefined && !ask) {
    throw new UsageError(`${command} create needs a layout: --layout <owner>/<repository>/<folder>@<rev> for a layout on GitHub, or the name of a folder in layouts/ or of a built-in layout such as ${defaultLayout}; "${command} layouts" lists them.`);
  }
  const language = options.language;
  if (language !== undefined && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(language)) {
    throw new UsageError(`The language "${language}" is no language tag such as de-AT.`);
  }
  // A new clone goes again when the project cannot be written, so that a second try starts as the first.
  const clones = path.join(project, '.markdownpaper');
  const fresh = !fs.existsSync(project);
  const cloned = !fs.existsSync(clones);
  try {
    let layout: Chosen;
    if (options.layout === undefined && ask && io.choose) {
      const offers = await offersOf(io);
      const index = await io.choose('Layout', offers.map((offer) => offer.choice), Math.max(0, offers.findIndex((offer) => offer.name === defaultLayout)));
      if (index === undefined) {
        throw new UsageError('No layout was chosen, so nothing was written.');
      }
      const offer = offers[index];
      layout = offer.remote ? await cloneLayout(io, project, offer.remote) : await resolveLayout(io, project, near, offer.name);
    } else {
      layout = await resolveLayout(io, project, near, await answer(`Layout (<owner>/<repository>/<folder>@<rev>, a folder in layouts/, or ${defaultLayout})`, options.layout, defaultLayout));
    }
    const chosenLanguage = await answer('Language of the document, for example de-AT or en-US', language, '');
    const title = await answer('Title of the document', options.title, '');
    const author = await answer('Author of the document', options.author, '');
    if (chosenLanguage && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(chosenLanguage)) {
      throw new UsageError(`The language "${chosenLanguage}" is no language tag such as de-AT.`);
    }
    return await writeProject({ folder, layout, ...(chosenLanguage ? { language: chosenLanguage } : {}), title, author }, io);
  } catch (error) {
    if (fresh || cloned) {
      fs.rmSync(fresh ? project : clones, { recursive: true, force: true });
    }
    throw error;
  }
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
    const name = options.layout?.includes('/') ? options.layout : layout.id;
    const written = writeFiles(path.dirname(file), [{ path: path.basename(file), content: newDocumentText(layout, start, values, name) }, ...startFiles(start, readFolder(folder))]);
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
    io.out(`    ${[offer.choice.label, offer.language, offer.choice.detail].filter(Boolean).join(' · ')}`);
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
  const { positional, options } = parse(args, ['browser'], ['write', 'download-browser']);
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
    const result = await exportPdf(paper, {
      assets: io.assets,
      output: preview,
      ...(options.browser ? { browser: options.browser } : {}),
      ...(options['download-browser'] ? { download: () => downloadChromium(io) } : {}),
    });
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
 * projectOf returns the folder of the project of a path: the folder of its Git repository, else the folder itself.
 * @param folder - The path of a folder in the project.
 */
function projectOf(folder: string): string {
  for (let candidate = folder; ; candidate = path.dirname(candidate)) {
    if (fs.existsSync(path.join(candidate, '.git'))) {
      return candidate;
    }
    if (path.dirname(candidate) === candidate) {
      return folder;
    }
  }
}

/**
 * papersOf returns the Markdown files of a project whose front matter names a layout: the paper documents. Folders
 * whose names start with a dot, such as `.git` and `.markdownpaper`, and `node_modules` stay out.
 * @param project - The folder of the project.
 */
function papersOf(project: string): string[] {
  const papers: string[] = [];
  const walk = (folder: string): void => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(folder, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(child);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const text = fs.readFileSync(child, 'utf8');
        if (/^---[ \t]*\r?\n/.test(text) && readFrontMatter(text)?.fields.some((field) => field.key === 'layout')) {
          papers.push(child);
        }
      }
    }
  };
  walk(project);
  return papers;
}

/**
 * updateCopies updates each copy of a layout on GitHub in a folder `layouts/` from the repository of the layout
 * ([R-LAY-010](../../docs/requirements.md#r-lay-010)): each folder whose `layout.json` has an origin.
 * @param io - The streams and the network.
 * @param layouts - The folder `layouts/`.
 * @param force - Whether the files of the repository replace the changes of the project.
 * @returns 1 when a copy stays as it is because of a conflict, else 0.
 */
async function updateCopies(io: Io, layouts: string, force: boolean): Promise<number> {
  const entries = fs.existsSync(layouts) ? fs.readdirSync(layouts, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
  const folders = entries.map((entry) => path.join(layouts, entry.name)).filter((folder) => fs.existsSync(path.join(folder, layoutFile)) && readOrigin(fs.readFileSync(path.join(folder, layoutFile), 'utf8')));
  const short = (commit: string): string => commit.slice(0, 7);
  let result = 0;
  for (const folder of folders.sort()) {
    const name = path.relative(io.cwd, folder) || '.';
    const update = await planUpdate(fetcherOf(io), readFolder(folder), { ...(token() ? { token: token() } : {}), force });
    const { origin } = update;
    const from = `${origin.layout.replace(/^github:/, '')}@${origin.ref}`;
    if (update.from === origin.commit) {
      io.out(`${name}: up to date with ${from} (${short(update.from)})`);
      continue;
    }
    if (update.conflicts.length > 0 && !force) {
      io.err(`${name}: the project and ${from} changed the same files: ${update.conflicts.join(', ')}. Nothing was written; --force replaces them with the files of ${short(origin.commit)}.`);
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
    io.out(`${name}: updated from ${short(update.from)} to ${short(origin.commit)} of ${from}: ${update.changed.length > 0 ? update.changed.join(', ') : 'no file of the layout changed'}`);
    if (update.kept.length > 0) {
      io.out(`  The changes of the project stay in: ${update.kept.join(', ')}`);
    }
  }
  return result;
}

/**
 * ignoreClones makes Git ignore the folder of the clones of a project, with a file `.gitignore` in it.
 * @param project - The folder of the project.
 */
function ignoreClones(project: string): void {
  const ignore = path.join(project, '.markdownpaper', '.gitignore');
  if (!fs.existsSync(ignore)) {
    fs.mkdirSync(path.dirname(ignore), { recursive: true });
    fs.writeFileSync(ignore, '*\n');
  }
}

/**
 * describeGot returns the line of a clone after `get`: the reference, the commit, and what changed.
 * @param name - The name of the clone.
 * @param spec - The reference.
 * @param got - The result of the clone.
 */
function describeGot(name: string, spec: RemoteSpec, got: { commit: string; rev: string; before?: string }): string {
  const short = (commit: string): string => commit.slice(0, 7);
  const change = got.before === undefined ? 'new clone' : got.before === got.commit ? 'up to date' : `from ${short(got.before)}`;
  return `${name}: ${spec.repository}@${got.rev} at ${short(got.commit)} (${change})`;
}

/**
 * markPublic asks GitHub without a sign-in whether a repository of `repos` is public, and writes the answer into the
 * Git configuration of its clone as `markdownpaper.public`: the renderer gives a listing of a public repository the
 * link to its lines ([R-PDF-005](../../docs/requirements.md#r-pdf-005)). GitHub answers 404 for a private repository.
 * Without an answer, for example without a network, the clone keeps the value that it has.
 * @param io - The network.
 * @param git - Git.
 * @param folder - The folder of the clone.
 * @param repository - The repository, `owner/repository`.
 */
async function markPublic(io: Io, git: Git, folder: string, repository: string): Promise<void> {
  let status: number;
  try {
    status = (await fetcherOf(io)(`https://api.github.com/repos/${repository}`, 'application/vnd.github+json')).status;
  } catch {
    return;
  }
  if (status === 200 || status === 404) {
    await git(['config', 'markdownpaper.public', String(status === 200)], folder);
  }
}

/**
 * runGet runs `get` ([R-CLI-004](../../docs/requirements.md#r-cli-004)): with a reference, it writes the reference
 * into the field `repos` of a paper and clones the repository; without one, it clones each repository that the papers
 * name and is missing, fetches into the others and checks out their revs, moves the references to tags with `-u`, and
 * updates the copies of layouts on GitHub in `layouts/` of the project.
 * @param args - The arguments after the command.
 * @param io - The streams, the network and Git.
 */
async function runGet(args: readonly string[], io: Io): Promise<number> {
  const newest = args.includes('-u');
  const { positional, options } = parse(
    args.filter((arg) => arg !== '-u'),
    ['name'],
    ['force'],
  );
  const files = positional.filter((arg) => /\.md$/i.test(arg));
  const targets = positional.filter((arg) => !/\.md$/i.test(arg));
  for (const file of files) {
    if (!fs.existsSync(path.resolve(io.cwd, file))) {
      throw new UsageError(`The file ${file} does not exist.`);
    }
  }
  if (targets.length > 1) {
    throw new UsageError(`${command} get takes one reference at a time.`);
  }
  if (options.name !== undefined && targets.length === 0) {
    throw new UsageError('--name names a new reference, so the call needs one: <owner>/<repository>@<rev>.');
  }
  const project = projectOf(files.length > 0 ? path.dirname(path.resolve(io.cwd, files[0])) : io.cwd);
  const papers = files.length > 0 ? files.map((file) => path.resolve(io.cwd, file)) : papersOf(project);
  const git = io.git ?? gitOf();
  const relative = (file: string): string => path.relative(io.cwd, file) || file;
  if (targets.length === 1) {
    const spec = parseRemote(targets[0]);
    if (!spec || spec.folder !== '') {
      throw new UsageError(`"${targets[0]}" is no reference to a repository: <owner>/<repository>@<rev>. The field layout names the layout.`);
    }
    if (papers.length !== 1) {
      throw new UsageError(papers.length === 0 ? `The project ${relative(project)} has no paper: a Markdown file whose front matter names a layout.` : `The project has ${papers.length} papers; name the one that gets the reference: ${command} get ${targets[0]} <file.md>`);
    }
    const name = options.name ?? cloneName(spec);
    if (!layoutName.test(name)) {
      throw new UsageError(`The name "${name}" of a reference holds only letters, digits, ".", "-" and "_".`);
    }
    const paper = papers[0];
    const text = fs.readFileSync(paper, 'utf8');
    const present = referencesOf(text).references.find((reference) => reference.name === name);
    if (present && present.spec.repository.toLowerCase() !== spec.repository.toLowerCase()) {
      throw new UsageError(`${relative(paper)} names ${present.text} as "${name}" already; --name gives the new reference another name.`);
    }
    ignoreClones(project);
    const folder = path.join(project, clonesFolder, name);
    const got = await getClone(git, folder, spec, { newest });
    if (present?.key !== 'layout') {
      await markPublic(io, git, folder, spec.repository);
    }
    fs.writeFileSync(paper, setReference(text, present?.key === 'layout' ? 'layout' : { repos: name }, { ...(present?.key === 'layout' ? present.spec : spec), ref: got.rev }));
    io.out(describeGot(name, spec, got));
    io.out(`${relative(paper)}: ${name}: ${spec.repository}@${got.rev}`);
    return 0;
  }
  // The references of all papers, by the names of their clones: one clone has one rev.
  const clones = new Map<string, { reference: Reference; papers: { file: string; reference: Reference }[] }>();
  let result = 0;
  for (const paper of papers) {
    const { references, problems } = referencesOf(fs.readFileSync(paper, 'utf8'));
    for (const problem of problems) {
      io.err(`${relative(paper)}:${problem.line + 1}:${problem.column + 1}: error: ${problem.message}`);
      result = 2;
    }
    for (const reference of references) {
      const known = clones.get(reference.name);
      if (!known) {
        clones.set(reference.name, { reference, papers: [{ file: paper, reference }] });
      } else if (known.reference.spec.repository.toLowerCase() !== reference.spec.repository.toLowerCase() || known.reference.spec.ref !== reference.spec.ref) {
        io.err(`${relative(paper)}:${reference.line + 1}:${reference.column + 1}: error: "${reference.name}" is ${reference.text} here and ${known.reference.text} in ${relative(known.papers[0].file)}; one clone has one rev, so the second one gets another name.`);
        result = 2;
      } else {
        known.papers.push({ file: paper, reference });
      }
    }
  }
  if (clones.size > 0) {
    ignoreClones(project);
  }
  for (const [name, { reference, papers: named }] of clones) {
    try {
      const folder = path.join(project, clonesFolder, name);
      const got = await getClone(git, folder, reference.spec, { newest });
      if (reference.key === 'repos') {
        await markPublic(io, git, folder, reference.spec.repository);
      }
      io.out(describeGot(name, reference.spec, got));
      if (reference.spec.ref !== undefined && got.rev !== reference.spec.ref) {
        for (const { file, reference: own } of named) {
          fs.writeFileSync(file, setReference(fs.readFileSync(file, 'utf8'), own.key === 'layout' ? 'layout' : { repos: own.name }, { ...own.spec, ref: got.rev }));
          io.out(`  ${relative(file)}: ${own.key === 'layout' ? 'layout' : `repos ${own.name}`} from @${reference.spec.ref} to @${got.rev}`);
        }
      }
    } catch (error) {
      if (!(error instanceof GitError)) {
        throw error;
      }
      io.err(`${name}: error: ${error.message}`);
      result = 2;
    }
  }
  const copies = await updateCopies(io, path.join(project, 'layouts'), options.force !== undefined);
  if (clones.size === 0 && !fs.existsSync(path.join(project, 'layouts'))) {
    io.out('No paper of the project names a repository on GitHub, and no folder layouts/ has a copy of a layout on GitHub.');
  }
  return Math.max(result, copies);
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
      case 'build':
        return await runBuild(rest, io);
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
      case 'get':
        return await runGet(rest, io);
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
      case 'pdf':
        throw new UsageError(`${command} build writes the PDF now: ${command} build ${rest.join(' ')}`.trimEnd());
      case 'update':
        throw new UsageError(`${command} get updates the copies of layouts now, with the clones of the references.`);
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
