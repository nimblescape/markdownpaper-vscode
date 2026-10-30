// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The command markdownpaper ([R-CLI-001](../../docs/requirements.md#r-cli-001)), for people on the command line, for
 * programs and for AI agents. It is the npm package @nimblescape/markdownpaper of cli/:
 *
 * - `pdf <file>` writes the PDF of a Markdown file in its layout, with an installed Chrome, Chromium or Edge.
 * - `check <file>...` checks the front matter of each file against its layout.
 * - `create [folder]` scaffolds a new project, as `npm create vite` does: it asks for the name, the layout, the
 *   language, the title and the author, or takes them from its options (Hannes, 2026-10-29: "it can scaffold, similar
 *   as a vite scaffold works").
 * - `new document|layout|project` writes a new document, a new layout folder, or a new project without questions.
 * - `instructions [topic]` prints the rules of a topic for AI agents.
 *
 * The exit code is 0 for success, 1 when `check` found a problem or `pdf` wrote the PDF with problems of the document,
 * and 2 for a wrong command or option, a missing file, a file that exists already, or a PDF that could not be made.
 * The module uses no API of VS Code, and main.ts runs it in Node.js.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { version } from '../../package.json';
import { checkDocument } from '../paper/checks';
import { topicList, topics } from '../paper/instructions';
import { formatText, type Layout, type Problem } from '../paper/layout';
import { defaultLayout, findLayout, layoutName } from '../paper/render';
import { type NewFile, newDocumentText, newLayoutFiles, newProjectFiles, packageName } from '../paper/scaffold';
import { type Assets, exportPdf, fileReader, folderUrl } from '../pdf/export';

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
  '  check <file.md>...            check the front matter of each file against its layout',
  '  create [folder]               scaffold a new project; asks for what its options do not give',
  '      --layout <name>           the layout to copy into the project (default: plain)',
  '      --language <tag>          the language of the project, for example de-AT or en-US',
  '      --title <text>            the title of the document',
  '      --author <text>           the author of the document',
  '      --yes                     ask nothing: take the defaults',
  '  new document <file.md>        write a new document; --layout <name> names its layout (default: plain)',
  '  new layout <folder>           write a new layout folder, copied from --from <name> (default: plain), --language <tag>',
  '  new project <folder>          write a new project without questions, with the options of create',
  '  instructions [topic]          print the rules of a topic for AI agents; without a topic, the list',
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
  /** cwd is the folder of the relative paths. */
  cwd: string;
  /** assets are the built-in layouts and Paged.js of the package. */
  assets: Assets;
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

/** ProjectAnswers are the answers for a new project. */
interface ProjectAnswers {
  folder: string;
  layout: string;
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
  const { layout, folder } = await layoutAt(io, path.join(target, 'paper', 'paper.md'), answers.layout);
  const language = answers.language || layout.language;
  const values: Record<string, string> = {};
  if (answers.title) {
    values.title = answers.title;
  }
  if (answers.author) {
    values.author = answers.author;
  }
  const written = writeFiles(target, newProjectFiles({ layout, source: readFolder(folder), language, values }, startOf(layout, folder)));
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
  const layout = await answer('Layout (plain, or the name of a folder in layouts/)', options.layout, defaultLayout);
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
    const written = writeFiles(path.dirname(file), [{ path: path.basename(file), content: newDocumentText(layout, startOf(layout, folder), values) }]);
    io.out(path.relative(io.cwd, written[0]));
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
      case 'create':
        return await runCreate(rest, io, true);
      case 'new':
        return await runNew(rest, io);
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
