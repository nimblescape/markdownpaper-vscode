// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The citations from the editor ([R-CITE-002](../docs/requirements.md#r-cite-002),
 * [R-CITE-006](../docs/requirements.md#r-cite-006)): the slash command `/cite` inserts a citation of a source of the
 * database of the document or of an item of the Zotero library of the author or of a group library of the setting
 * `zoteroGroups`, "Connect Zotero" keeps the API key of Zotero in the secret storage of VS Code, and "Update Sources
 * from Zotero" merges each item of these libraries into its line of the database. The rules of the merge are in
 * [paper/zotero.ts](paper/zotero.ts).
 */

import * as vscode from 'vscode';
import { fetcher } from './commands';
import type { PaperFormatStep } from './formatStep';
import { fileOf, type SlashCommand } from './notesApi';
import { findDatabase, updateSources } from './paper/citations';
import { cite, type Source } from './paper/csl';
import { isPaperDocument } from './paper/frontMatter';
import type { Fetcher } from './paper/lookup';
import { sourcesFolder } from './paper/scaffold';
import {
  allLibraryItems,
  groupLibraries,
  itemOf,
  keyUser,
  type Merge,
  matchItem,
  mergeItem,
  newSource,
  pdfOf,
  searchLibraries,
  showValue,
  type ZoteroItem,
  zoteroField,
} from './paper/zotero';
import { checkedSettings, settingsSection } from './settings';

/** secretName is the name of the API key of Zotero and its library in the secret storage of VS Code. */
const secretName = 'nimblescape.markdownPaper.zotero';

/** keysPage is the page of zotero.org where the author makes an API key. */
const keysPage = 'https://www.zotero.org/settings/keys';

/** Connection is the API key of Zotero and the library of its user, for example `users/1234567`. */
interface Connection {
  key: string;
  library: string;
}

/** CiteContext is what the commands of the citations need: the secret storage, the network and the layouts of the format step. */
export interface CiteContext {
  secrets: vscode.SecretStorage;
  fetch: Fetcher;
  formatStep: PaperFormatStep;
}

/**
 * citeContext returns the context of the commands of the citations.
 * @param context - The context of the extension.
 * @param formatStep - The format step of the paper, which has the layouts of the open paper documents.
 */
export function citeContext(context: vscode.ExtensionContext, formatStep: PaperFormatStep): CiteContext {
  const version = (context.extension.packageJSON as { version?: string }).version ?? '0';
  return { secrets: context.secrets, fetch: fetcher(`nimblescape-markdownpaper/${version}`), formatStep };
}

/**
 * connection returns the connection to Zotero, or undefined when the author did not connect Zotero.
 * @param secrets - The secret storage.
 */
async function connection(secrets: vscode.SecretStorage): Promise<Connection | undefined> {
  try {
    const value = JSON.parse((await secrets.get(secretName)) ?? 'null') as Partial<Connection> | null;
    return typeof value?.key === 'string' && typeof value.library === 'string' ? { key: value.key, library: value.library } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * librariesOf returns the libraries of Zotero for a document: the personal library of the connection, then the group
 * libraries of the setting `zoteroGroups` of the document.
 * @param zotero - The connection to Zotero.
 * @param file - The file of the document.
 */
function librariesOf(zotero: Connection, file: vscode.Uri): string[] {
  const configuration = vscode.workspace.getConfiguration(settingsSection, file);
  return [zotero.library, ...groupLibraries(checkedSettings((key) => configuration.get(key)).zoteroGroups)];
}

/**
 * connectZoteroCommand asks for the API key of Zotero, reads the library of its user, and keeps both in the secret
 * storage. An empty key removes the connection.
 * @param context - The context of the citations.
 */
export async function connectZoteroCommand(context: CiteContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: 'Connect Zotero',
    prompt: `The API key of zotero.org that may read your library: make one at ${keysPage}. An empty key removes the connection.`,
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) {
    return;
  }
  if (key.trim() === '') {
    await context.secrets.delete(secretName);
    void vscode.window.showInformationMessage('Zotero is no longer connected.');
    return;
  }
  try {
    const library = await keyUser(context.fetch, key.trim());
    await context.secrets.store(secretName, JSON.stringify({ key: key.trim(), library }));
    void vscode.window.showInformationMessage(
      `Zotero is connected: /cite shows the items of the library ${library}, and of the group libraries of the setting ${settingsSection}.zoteroGroups.`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Connect Zotero: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * authorsOf returns the names of a source as a list shows them: the family names, with "et al." after two.
 * @param source - The source.
 */
function authorsOf(source: Source): string {
  const names = (source.author ?? source.editor ?? []).map((name) => name.family ?? name.literal ?? '').filter((name) => name !== '');
  return names.length > 2 ? `${names[0]} et al.` : names.join(' & ');
}

/** yearOf returns the year of a source, or an empty text. */
const yearOf = (source: Source): string => String(source.issued?.['date-parts']?.[0]?.[0] ?? '');

/** CiteItem is an entry of the list of `/cite`: a source of the database, an item of Zotero, or both. */
interface CiteItem extends vscode.QuickPickItem {
  source?: Source;
  item?: ZoteroItem;
}

/**
 * listItems returns the entries of the list of `/cite`: first the sources of the database, then the items of Zotero
 * that the database does not have. An item of Zotero whose line the database has shows once, as that source, and an
 * item of a group library with the DOI or the ISBN of an item before it in the list does not show.
 * @param sources - The sources of the database.
 * @param items - The items of Zotero, of the personal library first.
 * @param problems - Why a library of Zotero gave no items.
 */
function listItems(sources: readonly Source[], items: readonly ZoteroItem[], problems: readonly string[] = []): CiteItem[] {
  const matched = new Map<string, ZoteroItem>();
  const others: ZoteroItem[] = [];
  for (const item of items) {
    const match = matchItem(item, sources);
    if (match) {
      if (!matched.has(match.source.id)) {
        matched.set(match.source.id, item);
      }
    } else if (!matchItem(item, others.map((other, index) => ({ ...other.source, id: String(index) })))) {
      others.push(item);
    }
  }
  const problem = problems.join('; ');
  const list: CiteItem[] = sources.map((source) => ({
    label: source.title ?? source.id,
    description: [authorsOf(source), yearOf(source)].filter((part) => part !== '').join(', '),
    detail: matched.has(source.id) || typeof source[zoteroField] === 'string' ? `${source.id} · also in Zotero` : source.id,
    source,
    item: matched.get(source.id),
  }));
  if (others.length > 0 || problem) {
    list.push({ label: problem ? `Zotero: ${problem}` : 'Zotero', kind: vscode.QuickPickItemKind.Separator });
  }
  for (const item of others) {
    list.push({
      label: item.source.title ?? item.ref,
      description: [item.creators, item.year].filter((part) => part !== '').join(', '),
      detail: item.group ? `Zotero, ${item.group}: a new source of the document` : 'Zotero: a new source of the document',
      alwaysShow: true,
      item,
    });
  }
  return list;
}

/**
 * pickSource shows the list of `/cite` and returns the chosen entry. With Zotero, the list shows the items changed
 * last, and the items of a search of Zotero after a pause in typing, of each library.
 * @param context - The context of the citations.
 * @param sources - The sources of the database.
 * @param zotero - The connection to Zotero, if any.
 * @param libraries - The libraries of Zotero, the personal library first.
 */
async function pickSource(context: CiteContext, sources: readonly Source[], zotero: Connection | undefined, libraries: readonly string[]): Promise<CiteItem | undefined> {
  const pick = vscode.window.createQuickPick<CiteItem>();
  pick.title = 'Cite a source';
  pick.placeholder = zotero
    ? 'Search the sources of the document and of Zotero by author, title and year'
    : 'Search the sources of the document by author, title and year; "Connect Zotero" adds the items of Zotero';
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;
  pick.items = listItems(sources, []);
  let asked = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const search = (words: string) => {
    if (!zotero) {
      return;
    }
    const number = ++asked;
    pick.busy = true;
    searchLibraries(context.fetch, zotero.key, libraries, words).then(
      (found) => {
        if (number === asked) {
          pick.items = listItems(sources, found.items, found.problems);
        }
      },
      (error: unknown) => {
        if (number === asked) {
          pick.items = listItems(sources, [], [error instanceof Error ? error.message : String(error)]);
        }
      },
    ).finally(() => {
      if (number === asked) {
        pick.busy = false;
      }
    });
  };
  search('');
  return new Promise<CiteItem | undefined>((resolve) => {
    pick.onDidChangeValue((value) => {
      clearTimeout(timer);
      timer = setTimeout(() => search(value), 400);
    });
    pick.onDidAccept(() => {
      const chosen = pick.selectedItems[0];
      if (chosen && chosen.kind !== vscode.QuickPickItemKind.Separator) {
        resolve(chosen);
        pick.hide();
      }
    });
    pick.onDidHide(() => {
      clearTimeout(timer);
      resolve(undefined);
      pick.dispose();
    });
    pick.show();
  });
}

/**
 * confirmChanges asks once whether the values of Zotero replace the values of the database, and returns whether they do.
 * @param merges - The merges with changed values.
 */
async function confirmChanges(merges: readonly Merge[]): Promise<boolean> {
  const changed = merges.filter((merge) => merge.changed.length > 0);
  if (changed.length === 0) {
    return false;
  }
  const lines = changed.flatMap((merge) => merge.changed.map((change) => `${merge.id}, ${change.field}: ${showValue(change.from)} → ${showValue(change.to)}`));
  const shown = lines.length > 12 ? [...lines.slice(0, 12), `… and ${lines.length - 12} more`] : lines;
  const answer = await vscode.window.showInformationMessage(
    changed.length === 1 ? `Zotero has other values for the source "${changed[0].id}".` : `Zotero has other values for ${changed.length} sources.`,
    { modal: true, detail: `${shown.join('\n')}\n\nThe fields that the database does not have are added in any case.` },
    'Update from Zotero',
    'Keep the Database',
  );
  return answer === 'Update from Zotero';
}

/**
 * replaceText changes the text of a document to a new text with one edit: from the first to the last character that
 * differ.
 * @param edit - The edit to add the change to.
 * @param document - The document.
 * @param next - The new text.
 */
function replaceText(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, next: string): void {
  const old = document.getText();
  let start = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) {
    start++;
  }
  let end = 0;
  while (end < old.length - start && end < next.length - start && old[old.length - 1 - end] === next[next.length - 1 - end]) {
    end++;
  }
  edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(old.length - end)), next.slice(start, next.length - end));
}

/**
 * bibFolderOf returns the folder `bib/` of the project of a file: the nearest folder above the file with `bib/`, else
 * the nearest folder with `layouts/`, else the folder of the workspace, each with `bib/` in it.
 * @param file - The file.
 */
async function bibFolderOf(file: vscode.Uri): Promise<vscode.Uri> {
  const top = vscode.workspace.getWorkspaceFolder(file)?.uri;
  const exists = (uri: vscode.Uri) => vscode.workspace.fs.stat(uri).then((stat) => (stat.type & vscode.FileType.Directory) !== 0, () => false);
  const folders: vscode.Uri[] = [];
  for (let folder = vscode.Uri.joinPath(file, '..'); ; folder = vscode.Uri.joinPath(folder, '..')) {
    folders.push(folder);
    if (!top || folder.path === top.path || folder.path === '/' || !folder.path.startsWith(top.path)) {
      break;
    }
  }
  for (const name of [sourcesFolder, 'layouts']) {
    for (const folder of folders) {
      if (await exists(vscode.Uri.joinPath(folder, name))) {
        return vscode.Uri.joinPath(folder, sourcesFolder);
      }
    }
  }
  return vscode.Uri.joinPath(top ?? folders[0], sourcesFolder);
}

/**
 * copyPdf copies the PDF file of an item of Zotero to `bib/<ID>.pdf`, when Zotero stores one and the file does not exist.
 * @param context - The context of the citations.
 * @param zotero - The connection to Zotero.
 * @param item - The item.
 * @param id - The ID of its source.
 * @param file - The file of the document.
 */
async function copyPdf(context: CiteContext, zotero: Connection, item: ZoteroItem, id: string, file: vscode.Uri): Promise<void> {
  if (item.children === 0 || file.scheme !== 'file') {
    return;
  }
  const target = vscode.Uri.joinPath(await bibFolderOf(file), `${id}.pdf`);
  if (await vscode.workspace.fs.stat(target).then(() => true, () => false)) {
    return;
  }
  const pdf = await pdfOf(context.fetch, zotero.key, item.ref);
  if (pdf) {
    await vscode.workspace.fs.writeFile(target, pdf);
    void vscode.window.showInformationMessage(`The PDF of "${id}" from Zotero is in ${vscode.workspace.asRelativePath(target)}.`);
  }
}

/**
 * citationText returns the text of a parenthetical citation of a source in the citation style of the layout of the
 * document, or, before the extension read the layout, the names and the year. The formatter writes the text anew.
 * @param context - The context of the citations.
 * @param lines - The lines of the file, with the source in its database.
 * @param file - The file.
 * @param source - The source.
 */
function citationText(context: CiteContext, lines: readonly string[], file: vscode.Uri, source: Source): string {
  const entry = context.formatStep.entryOf(lines, file);
  if (entry) {
    try {
      const text = cite(entry.style, entry.layout.language, findDatabase(lines)?.sources ?? [source], [{ id: source.id, form: 'parenthetical' }]).citations[0];
      if (text) {
        return text;
      }
    } catch {
      // A style that citeproc-js cannot apply: the checks name it, and the names and the year stand in the text.
    }
  }
  return [authorsOf(source), yearOf(source)].filter((part) => part !== '').join(', ') || source.id;
}

/**
 * citeAt inserts a citation of a chosen source at a place of a paper document: `([Hong et al., 2024](#hong2024))`. An
 * item of Zotero is merged into the database first, and its PDF file goes to `bib/`.
 * @param context - The context of the citations.
 * @param editor - The text editor, also of the clean editing view of Markdown Notes.
 * @param range - The place of the citation.
 * @returns Whether the citation was inserted.
 */
export async function citeAt(context: CiteContext, editor: vscode.TextEditor, range: vscode.Range): Promise<boolean> {
  const file = fileOf(editor.document.uri);
  const document = await vscode.workspace.openTextDocument(file);
  if (!isPaperDocument(document.getText())) {
    void vscode.window.showInformationMessage('/cite works in a paper document: a Markdown file with the field "layout" in its front matter.');
    return false;
  }
  const zotero = await connection(context.secrets);
  const chosen = await pickSource(context, findDatabase(document.getText().split(/\r?\n/))?.sources ?? [], zotero, zotero ? librariesOf(zotero, file) : []);
  if (!chosen) {
    return false;
  }
  // The text of the file now, after the time of the list.
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const sources = findDatabase(lines)?.sources ?? [];
  let source = chosen.source;
  let next = lines;
  if (chosen.item) {
    const match = matchItem(chosen.item, sources);
    const merge = match && mergeItem(match.source, chosen.item);
    source = merge ? ((await confirmChanges([merge])) ? merge.updated : merge.kept) : newSource(chosen.item, new Set(sources.map((one) => one.id)));
    const updated = merge ? updateSources(lines, new Map([[source.id, source]]), []) : updateSources(lines, new Map(), [source]);
    if (updated.problem) {
      void vscode.window.showErrorMessage(`/cite: ${updated.problem}`);
      return false;
    }
    next = updated.lines;
  }
  if (!source) {
    return false;
  }
  // A citation after a word gets a space before it: "teams ([Hong et al., 2024](#hong2024))".
  const before = range.start.character > 0 ? editor.document.getText(new vscode.Range(range.start.translate(0, -1), range.start)) : '';
  const citation = `${/^[^\s([]$/.test(before) ? ' ' : ''}([${citationText(context, next, file, source)}](#${source.id}))`;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const edit = new vscode.WorkspaceEdit();
  if (next !== lines) {
    replaceText(edit, document, next.join(eol));
  }
  const same = editor.document.uri.toString() === file.toString();
  if (same) {
    edit.insert(file, range.start, citation);
  }
  if (!(await vscode.workspace.applyEdit(edit))) {
    return false;
  }
  // The clean editing view of Markdown Notes leaves the database out, so its editor gets the citation after the file.
  if (!same && !(await editor.edit((builder) => builder.insert(range.start, citation)))) {
    return false;
  }
  if (zotero && chosen.item) {
    void copyPdf(context, zotero, chosen.item, source.id, file).catch((error: unknown) => {
      void vscode.window.showWarningMessage(`/cite: the PDF of "${source.id}" did not come from Zotero: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  return true;
}

/**
 * citeCommand returns the slash command `/cite`.
 * @param context - The context of the citations.
 */
export function citeCommand(context: CiteContext): SlashCommand {
  return {
    label: '/cite',
    description: 'Cite a source',
    detail: 'Inserts a citation of a source of the database of the document, or of an item of your Zotero library.',
    run: (editor, range) => citeAt(context, editor, range),
  };
}

/**
 * updateSourcesCommand merges each item of Zotero whose line the database of the open paper document has into that
 * line: by the field `zotero` of the line, then by the DOI, then by the ISBN. It reads the personal library and the
 * group libraries of the setting `zoteroGroups`. It adds the fields that a line does not have, and asks once whether
 * the values of Zotero replace the other values.
 * @param context - The context of the citations.
 * @param uri - The file of the Explorer, else the file of the active text editor.
 */
export async function updateSourcesCommand(context: CiteContext, uri?: unknown): Promise<void> {
  const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
  const zotero = await connection(context.secrets);
  if (!target) {
    void vscode.window.showWarningMessage('Update Sources from Zotero: open a paper document first.');
    return;
  }
  if (!zotero) {
    void vscode.window.showWarningMessage('Update Sources from Zotero: run "Connect Zotero" first.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(fileOf(target));
  const sources = findDatabase(document.getText().split(/\r?\n/))?.sources ?? [];
  if (sources.length === 0) {
    void vscode.window.showInformationMessage('Update Sources from Zotero: the document has no sources.');
    return;
  }
  const libraries = librariesOf(zotero, document.uri);
  let merges: Merge[];
  let problems: string[] = [];
  try {
    merges = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Reading the Zotero libraries' }, async () => {
      const read = await allLibraryItems(context.fetch, zotero.key, libraries);
      const items = read.items;
      problems = read.problems;
      // A line of another library, such as a group library that the setting does not name, gets its item by its
      // reference.
      for (const source of sources) {
        const ref = source[zoteroField];
        if (typeof ref === 'string' && !libraries.some((library) => ref.startsWith(`${library}/`)) && !items.some((item) => item.ref === ref)) {
          const item = await itemOf(context.fetch, zotero.key, ref);
          if (item) {
            items.push(item);
          }
        }
      }
      const found = new Map<string, Merge>();
      for (const item of items) {
        const match = matchItem(item, sources);
        if (match && !found.has(match.source.id)) {
          found.set(match.source.id, mergeItem(match.source, item));
        }
      }
      return [...found.values()];
    });
  } catch (error) {
    void vscode.window.showErrorMessage(`Update Sources from Zotero: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const replace = await confirmChanges(merges);
  const changed = new Map(merges.filter((merge) => merge.added.length > 0 || (replace && merge.changed.length > 0)).map((merge) => [merge.id, replace ? merge.updated : merge.kept]));
  // The text of the file now, after the time of the requests and the question.
  const text = document.getText();
  const updated = updateSources(text.split(/\r?\n/), changed, []);
  if (updated.problem) {
    void vscode.window.showErrorMessage(`Update Sources from Zotero: ${updated.problem}`);
    return;
  }
  if (changed.size > 0) {
    const edit = new vscode.WorkspaceEdit();
    replaceText(edit, document, updated.lines.join(text.includes('\r\n') ? '\r\n' : '\n'));
    await vscode.workspace.applyEdit(edit);
  }
  const values = replace ? merges.reduce((sum, merge) => sum + merge.changed.length, 0) : 0;
  const fields = merges.reduce((sum, merge) => sum + merge.added.length, 0);
  const summary = `Update Sources from Zotero: ${merges.length} of ${sources.length} sources have an item in Zotero; ${changed.size} lines changed, with ${fields} added fields and ${values} new values.`;
  if (problems.length > 0) {
    void vscode.window.showWarningMessage(`${summary} Not read: ${problems.join('; ')}`);
  } else {
    void vscode.window.showInformationMessage(summary);
  }
}
