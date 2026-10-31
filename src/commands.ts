// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The commands of the extension that write files: "Export PDF" ([R-PDF-001](../docs/requirements.md#r-pdf-001)),
 * "New Project", "New Document" and "New Layout" ([R-NEW-001](../docs/requirements.md#r-new-001) to
 * [R-NEW-004](../docs/requirements.md#r-new-004)), which write no file over an existing one, and "Update Layout"
 * ([R-LAY-010](../docs/requirements.md#r-lay-010)), which updates a copy of a layout on GitHub from its repository.
 * "Open Repository in New Window" ([R-CLI-004](../docs/requirements.md#r-cli-004)) opens the clone of a reference of a
 * paper.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { markdownExtensions, plantUmlOptions } from './markdownExtensions';
import { fileOf, textOf } from './notesApi';
import { downloadRemote, findRemotes, previewUrl, type RemoteLayout, type RemoteSpec, readOrigin, remoteName } from './paper/gallery';
import type { Layout } from './paper/layout';
import type { Fetcher } from './paper/lookup';
import { clonesFolder, type Reference, referencesOf } from './paper/references';
import { defaultLayout, findClone, findLayout, layoutName } from './paper/render';
import { type NewFile, newDocumentText, newLayoutFiles, newProjectFiles, startFiles } from './paper/scaffold';
import { planUpdate, type Update } from './paper/update';
import { defaultPlace, downloadBrowser, downloadSize } from './pdf/download';
import { exportPdf } from './pdf/export';
import { settingsSection } from './settings';
import { command as terminalCommand, runInTerminal } from './terminal';
import { folderUrl, readFolder, searchHost, workspaceReader } from './workspaceHost';

/** Context is what the commands need from the extension. */
export interface Context {
  extension: vscode.Uri;
  /** browserPath is the setting of the program of the browser. */
  browserPath(): string;
  /** openPdf is the setting that opens the PDF after the export. */
  openPdf(): boolean;
  /** previewFile is the paper document of the active Markdown preview, if one is active. */
  previewFile(): vscode.Uri | undefined;
  /** version is the version of the extension, for the header User-Agent of the requests to GitHub. */
  version?: string;
}

const decoder = new TextDecoder();

/**
 * targetOf returns the file of a command: the file of the Explorer, else of the active Markdown preview, else of the
 * active text editor.
 * @param context - The context.
 * @param uri - The URI that the Explorer or a menu passes, if any.
 */
function targetOf(context: Context, uri: unknown): vscode.Uri | undefined {
  if (uri instanceof vscode.Uri) {
    return fileOf(uri);
  }
  const preview = context.previewFile();
  if (preview) {
    return preview;
  }
  const editor = vscode.window.activeTextEditor;
  return editor && editor.document.languageId === 'markdown' ? fileOf(editor.document.uri) : undefined;
}

/**
 * exportPdfCommand writes the PDF of a Markdown file beside it, with its unsaved changes.
 * @param context - The context.
 * @param uri - The URI of the Explorer, if any.
 * @returns The URI of the PDF, or undefined.
 */
export async function exportPdfCommand(context: Context, uri?: unknown): Promise<vscode.Uri | undefined> {
  const file = targetOf(context, uri);
  if (!file) {
    void vscode.window.showWarningMessage('Export PDF: open a Markdown file first.');
    return undefined;
  }
  if (file.scheme !== 'file') {
    void vscode.window.showErrorMessage('Export PDF needs a file on the disk of this computer, because the browser reads the file and its images from the disk.');
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(file);
  try {
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Export PDF: ${path.basename(file.fsPath)}` }, async (progress) =>
      exportPdf(file.fsPath, {
        assets: {
          layouts: vscode.Uri.joinPath(context.extension, 'layouts').fsPath,
          pagedJs: vscode.Uri.joinPath(context.extension, 'media', 'paged.polyfill.js').fsPath,
          plantUml: vscode.Uri.joinPath(context.extension, 'media', 'plantuml').fsPath,
        },
        text: await textOf(file),
        browser: context.browserPath(),
        download: () => downloadChromium(context, progress),
        ...(folder?.uri.scheme === 'file' ? { top: folder.uri.fsPath } : {}),
        extensions: await markdownExtensions(context.extension, file),
        plantUml: plantUmlOptions(file),
      }),
    );
    const pdf = vscode.Uri.file(result.pdf);
    const problems = result.problems.length + result.messages.length;
    const message = `Export PDF: ${vscode.workspace.asRelativePath(pdf)}${problems ? ` (${problems} ${problems === 1 ? 'problem' : 'problems'}, see the Problems view)` : ''}`;
    if (context.openPdf()) {
      await vscode.env.openExternal(pdf);
      void vscode.window.showInformationMessage(message);
    } else {
      void vscode.window.showInformationMessage(message, 'Open PDF').then((choice) => (choice ? vscode.env.openExternal(pdf) : undefined));
    }
    return pdf;
  } catch (error) {
    void vscode.window.showErrorMessage(`Export PDF: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * downloadChromium asks whether Markdown Paper may download Chromium for the PDF when no browser is installed, and
 * downloads it once into the cache of the user, which the command mp shares
 * ([R-PDF-002](../docs/requirements.md#r-pdf-002)).
 * @param context - The context.
 * @param progress - The progress of "Export PDF", which shows the download.
 * @returns The program of Chromium, or undefined when the person does not want the download or the system has no build.
 */
async function downloadChromium(context: Context, progress: vscode.Progress<{ message?: string }>): Promise<string | undefined> {
  const place = defaultPlace();
  const size = downloadSize(place);
  if (size === undefined) {
    return undefined;
  }
  const choice = await vscode.window.showWarningMessage(
    'No Google Chrome, Chromium or Microsoft Edge is installed for the PDF.',
    {
      modal: true,
      detail: `Markdown Paper can download Chromium ${place.release.version}, the headless shell of Chrome for Testing, once from storage.googleapis.com (about ${size} MB) into ${place.cache}. The command mp uses it too.`,
    },
    'Download Chromium',
    'Set Browser Path',
  );
  if (choice === 'Set Browser Path') {
    void vscode.commands.executeCommand('workbench.action.openSettings', `${settingsSection}.browserPath`);
  }
  if (choice !== 'Download Chromium') {
    return undefined;
  }
  progress.report({ message: `downloading Chromium (about ${size} MB) …` });
  return downloadBrowser(fetcher(`nimblescape-markdownpaper/${context.version ?? '0'}`), place);
}

/**
 * writeNew writes new files into a folder, and none when one of them exists.
 * @param folder - The URI of the folder.
 * @param files - The files.
 * @returns The URIs of the written files, or undefined when a file exists.
 */
async function writeNew(folder: vscode.Uri, files: readonly NewFile[]): Promise<vscode.Uri[] | undefined> {
  const targets = files.map((file) => vscode.Uri.joinPath(folder, ...file.path.split('/')));
  for (const target of targets) {
    try {
      await vscode.workspace.fs.stat(target);
      void vscode.window.showErrorMessage(`The file ${vscode.workspace.asRelativePath(target)} exists already, so nothing was written.`);
      return undefined;
    } catch {
      // The file does not exist.
    }
  }
  for (const [index, file] of files.entries()) {
    await vscode.workspace.fs.writeFile(targets[index], typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content);
  }
  return targets;
}

/**
 * pickLayout asks for a layout: the layouts of the folders layouts/ of the workspace, and the built-in layouts.
 * @param context - The context.
 * @param near - The URI of a file in the folder where the search starts.
 * @param title - The title of the question.
 */
async function pickLayout(context: Context, near: vscode.Uri, title: string): Promise<{ layout: Layout; folder: vscode.Uri } | undefined> {
  const found = await vscode.workspace.findFiles('**/layouts/*/layout.json', '**/node_modules/**', 50);
  const names = [...new Set(found.map((uri) => uri.path.split('/').slice(-2, -1)[0]))].filter((name) => layoutName.test(name)).sort();
  const items = [
    ...names.map((name) => ({ label: name, description: 'layout of the workspace' })),
    ...(names.includes(defaultLayout) ? [] : [{ label: defaultLayout, description: 'built-in layout: A4, numbered headings, title block' }]),
  ];
  const choice = await vscode.window.showQuickPick(items, { title, placeHolder: 'Layout' });
  if (!choice) {
    return undefined;
  }
  const result = await findLayout(searchHost(context.extension, near), near.toString(), choice.label);
  if (!result.layout) {
    void vscode.window.showErrorMessage(result.problems.map((problem) => problem.message).join(' '));
    return undefined;
  }
  return { layout: result.layout, folder: vscode.Uri.parse(result.layout.folder, true) };
}

/**
 * startOf reads the start document of a layout, or returns undefined.
 * @param layout - The layout.
 */
async function startOf(layout: Layout): Promise<string | undefined> {
  if (!layout.document) {
    return undefined;
  }
  const bytes = await workspaceReader.read(`${layout.folder}${layout.document}`);
  return bytes && decoder.decode(bytes);
}

/**
 * fetcher returns the network of the extension: the fetch of VS Code, which uses the proxy settings of VS Code.
 * @param userAgent - The value of the header User-Agent.
 */
export const fetcher =
  (userAgent: string): Fetcher =>
  async (url, accept, headers = {}) => {
    const response = await fetch(url, { headers: { ...headers, Accept: accept, 'User-Agent': userAgent } });
    return { status: response.status, type: response.headers.get('content-type') ?? '', url: response.url, body: new Uint8Array(await response.arrayBuffer()) };
  };

/**
 * githubToken returns the token of the sign-in to GitHub of VS Code, without asking, or undefined without one: it raises
 * the limit of the requests to GitHub and reads private repositories too.
 */
const githubToken = async (): Promise<string | undefined> =>
  vscode.authentication.getSession('github', ['repo'], { silent: true }).then(
    (session) => session?.accessToken,
    () => undefined,
  );

/** LayoutItem is an entry of the list of the layouts of "New Project". */
interface LayoutItem extends vscode.QuickPickItem {
  name: string;
  remote?: RemoteLayout;
}

/**
 * pickProjectLayout asks for the layout of a new project ([R-NEW-004](../docs/requirements.md#r-new-004)): the layouts
 * of the folders layouts/ of the workspace, the built-in layouts, and the layouts on GitHub, which the list adds when
 * GitHub answers. The button of a layout on GitHub opens its preview PDF. With a sign-in to GitHub in VS Code, the
 * search uses its token, which raises the limit of the requests and finds private repositories too.
 * @param context - The context.
 * @param near - The URI of a file in the folder where the search starts.
 */
async function pickProjectLayout(context: Context, near: vscode.Uri): Promise<{ layout: Layout; source: Map<string, Uint8Array>; start?: string; reference?: RemoteSpec } | undefined> {
  const found = await vscode.workspace.findFiles('**/layouts/*/layout.json', '**/node_modules/**', 50);
  const names = [...new Set(found.map((uri) => uri.path.split('/').slice(-2, -1)[0]))].filter((name) => layoutName.test(name)).sort();
  const local: LayoutItem[] = [
    ...names.map((name) => ({ name, label: name, description: 'layout of the workspace' })),
    ...(names.includes(defaultLayout) ? [] : [{ name: defaultLayout, label: defaultLayout, description: 'built-in layout: A4, numbered headings, title block' }]),
  ];
  const preview = { iconPath: new vscode.ThemeIcon('file-pdf'), tooltip: 'Open the preview PDF' };
  const picker = vscode.window.createQuickPick<LayoutItem>();
  picker.title = 'Layout of the project';
  picker.placeholder = 'Layout; the layouts on GitHub follow';
  picker.matchOnDescription = true;
  picker.items = local;
  picker.busy = true;
  const token = await githubToken();
  const fetch = fetcher(`nimblescape-markdownpaper/${context.version ?? '0'}`);
  void findRemotes(fetch, token).then(
    ({ layouts }) => {
      const remote: LayoutItem[] = layouts.map((layout) => ({
        name: remoteName(layout),
        label: layout.layout.name,
        description: remoteName(layout),
        remote: layout,
        ...(previewUrl(layout) ? { buttons: [preview] } : {}),
      }));
      picker.items = [...local, { name: '', label: 'GitHub', kind: vscode.QuickPickItemKind.Separator }, ...remote];
      picker.busy = false;
    },
    (error: unknown) => {
      picker.busy = false;
      picker.placeholder = `Layout; GitHub gave no list: ${error instanceof Error ? error.message : String(error)}`;
    },
  );
  picker.onDidTriggerItemButton((event) => {
    const url = event.item.remote && previewUrl(event.item.remote);
    if (url) {
      void vscode.env.openExternal(vscode.Uri.parse(url));
    }
  });
  const choice = await new Promise<LayoutItem | undefined>((resolve) => {
    picker.onDidAccept(() => resolve(picker.selectedItems[0]));
    picker.onDidHide(() => resolve(undefined));
    picker.show();
  });
  picker.dispose();
  if (!choice) {
    return undefined;
  }
  if (choice.remote) {
    const remote = choice.remote;
    const source = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `New Project: reading ${remoteName(remote)} from GitHub` }, () => downloadRemote(fetch, remote));
    const start = remote.layout.document ? source.get(remote.layout.document.replace(/^\.\//, '')) : undefined;
    // The document names the layout by its reference, and mp get clones it (R-CLI-004); the project gets no copy.
    return { layout: remote.layout, source, reference: { repository: remote.repository, folder: remote.folder, ref: remote.ref }, ...(start ? { start: decoder.decode(start) } : {}) };
  }
  const result = await findLayout(searchHost(context.extension, near), near.toString(), choice.name);
  if (!result.layout) {
    void vscode.window.showErrorMessage(result.problems.map((problem) => problem.message).join(' '));
    return undefined;
  }
  const start = await startOf(result.layout);
  return { layout: result.layout, source: await readFolder(vscode.Uri.parse(result.layout.folder, true)), ...(start ? { start } : {}) };
}

/**
 * folderOfCommand returns the folder of a command of the Explorer, else the first folder of the workspace.
 * @param uri - The URI that the Explorer passes, if any.
 */
const folderOfCommand = (uri: unknown): vscode.Uri | undefined => (uri instanceof vscode.Uri ? uri : vscode.workspace.workspaceFolders?.[0]?.uri);

/**
 * newDocumentCommand writes a new document of a layout and opens it.
 * @param context - The context.
 * @param uri - The folder of the Explorer, if any.
 */
export async function newDocumentCommand(context: Context, uri?: unknown): Promise<vscode.Uri | undefined> {
  const folder = folderOfCommand(uri);
  const target = await vscode.window.showSaveDialog({ title: 'New Document', ...(folder ? { defaultUri: vscode.Uri.joinPath(folder, 'paper.md') } : {}), filters: { Markdown: ['md'] } });
  if (!target) {
    return undefined;
  }
  const picked = await pickLayout(context, target, 'Layout of the new document');
  if (!picked) {
    return undefined;
  }
  const parent = vscode.Uri.joinPath(target, '..');
  const start = await startOf(picked.layout);
  const written = await writeNew(parent, [{ path: target.path.split('/').pop() ?? 'paper.md', content: newDocumentText(picked.layout, start) }, ...startFiles(start, start ? await readFolder(picked.folder) : new Map())]);
  if (written) {
    await vscode.window.showTextDocument(written[0]);
  }
  return written?.[0];
}

/**
 * newLayoutCommand writes a new layout folder, copied from another layout.
 * @param context - The context.
 * @param uri - The folder of the Explorer, if any.
 */
export async function newLayoutCommand(context: Context, uri?: unknown): Promise<vscode.Uri | undefined> {
  const base = folderOfCommand(uri);
  if (!base) {
    void vscode.window.showWarningMessage('New Layout: open a folder first.');
    return undefined;
  }
  const name = await vscode.window.showInputBox({ title: 'New Layout', prompt: 'Name of the layout folder', placeHolder: 'my-layout', validateInput: (value) => (layoutName.test(value) ? undefined : 'Letters, digits, ".", "-" and "_", starting with a letter or a digit.') });
  if (!name) {
    return undefined;
  }
  const parent = base.path.endsWith('/layouts') ? base : vscode.Uri.joinPath(base, 'layouts');
  const target = vscode.Uri.joinPath(parent, name);
  const picked = await pickLayout(context, vscode.Uri.joinPath(target, 'layout.json'), 'Layout to copy');
  if (!picked) {
    return undefined;
  }
  const language = await vscode.window.showInputBox({ title: 'New Layout', prompt: 'Language of the documents, for example de-AT or en-US', value: picked.layout.language });
  if (language === undefined) {
    return undefined;
  }
  const written = await writeNew(target, newLayoutFiles(await readFolder(picked.folder), { name, ...(language ? { language } : {}) }));
  const json = written?.find((file) => file.path.endsWith('/layout.json'));
  if (json) {
    await vscode.window.showTextDocument(json);
  }
  return written ? target : undefined;
}

/**
 * newProjectCommand writes a new project: AGENTS.md, a copy of a layout of the workspace or of a built-in layout, or
 * the reference of a layout on GitHub, whose clone `mp get` makes in a terminal of VS Code, the document and the
 * folders of the sources and of the images, and opens the document.
 * @param context - The context.
 * @param uri - The folder of the Explorer, if any.
 */
export async function newProjectCommand(context: Context, uri?: unknown): Promise<vscode.Uri | undefined> {
  const chosen = await vscode.window.showOpenDialog({ title: 'New Project: the folder that gets the project folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false, ...(folderOfCommand(uri) ? { defaultUri: folderOfCommand(uri) } : {}) });
  if (!chosen?.[0]) {
    return undefined;
  }
  const name = await vscode.window.showInputBox({ title: 'New Project', prompt: 'Name of the project folder', value: 'paper-project', validateInput: (value) => (/^[^\\/:*?"<>|]+$/.test(value) ? undefined : 'A folder name without \\ / : * ? " < > |.') });
  if (!name) {
    return undefined;
  }
  const target = vscode.Uri.joinPath(chosen[0], name);
  let picked: Awaited<ReturnType<typeof pickProjectLayout>>;
  try {
    picked = await pickProjectLayout(context, vscode.Uri.joinPath(target, 'paper', 'paper.md'));
  } catch (error) {
    void vscode.window.showErrorMessage(`New Project: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  if (!picked) {
    return undefined;
  }
  const language = await vscode.window.showInputBox({ title: 'New Project', prompt: 'Language of the document, for example de-AT or en-US', value: picked.layout.language });
  if (language === undefined) {
    return undefined;
  }
  const title = (await vscode.window.showInputBox({ title: 'New Project', prompt: 'Title of the document' })) ?? '';
  const author = (await vscode.window.showInputBox({ title: 'New Project', prompt: 'Author of the document' })) ?? '';
  const values: Record<string, string> = {};
  if (title) {
    values.title = title;
  }
  if (author) {
    values.author = author;
  }
  const files = newProjectFiles({ layout: picked.layout, source: picked.source, language: language || picked.layout.language, values, ...(picked.reference ? { reference: picked.reference } : {}) }, picked.start);
  const written = await writeNew(target, files);
  if (!written) {
    return undefined;
  }
  // mp get clones the layout on GitHub into .markdownpaper/repos/ in a terminal of VS Code, with the Git and the access
  // of the author (R-NEW-004).
  if (picked.reference) {
    runInTerminal(target, `${terminalCommand} get`);
  }
  const paper = vscode.Uri.joinPath(target, 'paper', 'paper.md');
  const inWorkspace = vscode.workspace.getWorkspaceFolder(target) !== undefined;
  if (inWorkspace) {
    await vscode.window.showTextDocument(paper);
  } else {
    const open = await vscode.window.showInformationMessage(`New Project: ${target.fsPath || target.path}`, 'Open Folder');
    if (open) {
      await vscode.commands.executeCommand('vscode.openFolder', target, { forceNewWindow: true });
    }
  }
  return target;
}

/** ReferenceItem is an entry of the list of the references of "Open Repository in New Window". */
interface ReferenceItem extends vscode.QuickPickItem {
  reference: Reference;
}

/**
 * cloneOfReference finds the clone of a reference of a paper in `.markdownpaper/repos/<name>/` for "Open Repository
 * in New Window": the reference with the name, else the one that the author chooses from the references of the front
 * matter, `repos` and `layout`. A missing clone offers `mp get` in a terminal of VS Code.
 * @param context - The context.
 * @param uri - The paper of the Explorer or of Markdown Notes, else the paper of the active editor.
 * @param name - The name of the reference, for example from a listing in Markdown Notes.
 * @returns The URI of the folder of the clone, or undefined.
 */
export async function cloneOfReference(context: Context, uri?: unknown, name?: unknown): Promise<vscode.Uri | undefined> {
  const file = targetOf(context, uri);
  if (!file) {
    void vscode.window.showErrorMessage('Open Repository in New Window: open a paper document first.');
    return undefined;
  }
  const references = referencesOf(await textOf(file)).references.sort((a, b) => Number(a.key === 'layout') - Number(b.key === 'layout'));
  let reference: Reference | undefined;
  if (typeof name === 'string') {
    reference = references.find((candidate) => candidate.name === name);
    if (!reference) {
      void vscode.window.showErrorMessage(`Open Repository in New Window: the front matter of ${path.basename(file.path)} names no reference "${name}".`);
      return undefined;
    }
  } else if (references.length === 0) {
    void vscode.window.showInformationMessage(`Open Repository in New Window: the front matter of ${path.basename(file.path)} names no repository on GitHub in "layout" or "repos".`);
    return undefined;
  } else if (references.length === 1) {
    reference = references[0];
  } else {
    const items: ReferenceItem[] = references.map((candidate) => ({ label: candidate.name, description: candidate.text, detail: candidate.key === 'layout' ? 'The layout' : 'A repository of the listings', reference: candidate }));
    reference = (await vscode.window.showQuickPick(items, { title: 'Open Repository in New Window', placeHolder: 'The reference whose clone opens in a new window' }))?.reference;
  }
  if (!reference) {
    return undefined;
  }
  const clone = await findClone(searchHost(context.extension, file), file.toString(), reference.name);
  if (!clone) {
    // The message does not hold the command back, so a caller gets its answer at once.
    const missing = reference;
    void vscode.window.showInformationMessage(`${clonesFolder}/${missing.name}/ is missing: "${terminalCommand} get" clones ${missing.text}.`, `Run ${terminalCommand} get`).then((choice) => {
      if (choice) {
        runInTerminal(vscode.Uri.joinPath(file, '..'), `${terminalCommand} get`);
      }
    });
    return undefined;
  }
  return vscode.Uri.parse(clone.replace(/\/$/, ''));
}

/**
 * openRepositoryCommand opens the clone of a reference of a paper in a new window of VS Code
 * ([R-CLI-004](../docs/requirements.md#r-cli-004), [decision 55](../docs/requirements.md#decisions)), where Source
 * Control shows its Git repository and its files can be changed; the window of the paper shows them read-only.
 * @param context - The context.
 * @param uri - The paper, as for cloneOfReference.
 * @param name - The name of the reference, as for cloneOfReference.
 * @returns The URI of the opened clone, or undefined.
 */
export async function openRepositoryCommand(context: Context, uri?: unknown, name?: unknown): Promise<vscode.Uri | undefined> {
  const folder = await cloneOfReference(context, uri, name);
  if (folder) {
    await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: true });
  }
  return folder;
}

/** CopyItem is an entry of the list of the copies of layouts on GitHub of "Update Layout". */
interface CopyItem extends vscode.QuickPickItem {
  folders: vscode.Uri[];
}

/**
 * applyUpdate writes the changes of an update into the folder of a copy, and removes the files that the repository
 * removed, with the folders that they leave empty.
 * @param folder - The folder of the copy.
 * @param update - The update.
 */
async function applyUpdate(folder: vscode.Uri, update: Update): Promise<void> {
  for (const [path, content] of update.write) {
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, ...path.split('/')), content);
  }
  for (const path of update.remove) {
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(folder, ...path.split('/')), { useTrash: false });
    const parts = path.split('/').slice(0, -1);
    for (; parts.length > 0; parts.pop()) {
      const parent = vscode.Uri.joinPath(folder, ...parts);
      if ((await vscode.workspace.fs.readDirectory(parent)).length > 0) {
        break;
      }
      await vscode.workspace.fs.delete(parent);
    }
  }
}

/**
 * updateLayoutCommand updates copies of layouts on GitHub from their repositories
 * ([R-LAY-010](../docs/requirements.md#r-lay-010)): the layout folder of the Explorer, else the chosen copy of the
 * workspace, or all of them. A copy whose files the project and the repository both changed is updated only after a
 * confirmation, which replaces the changes of the project.
 * @param context - The context.
 * @param uri - The layout folder of the Explorer, if any.
 * @returns The messages of the copies, or undefined when nothing was chosen.
 */
export async function updateLayoutCommand(context: Context, uri?: unknown): Promise<string[] | undefined> {
  let folders: vscode.Uri[];
  if (uri instanceof vscode.Uri) {
    folders = [uri];
  } else {
    const found = await vscode.workspace.findFiles('**/layouts/*/layout.json', '**/node_modules/**', 50);
    const copies: CopyItem[] = [];
    for (const file of found.sort((a, b) => a.path.localeCompare(b.path))) {
      const origin = readOrigin(decoder.decode(await vscode.workspace.fs.readFile(file)));
      if (origin) {
        copies.push({ label: vscode.workspace.asRelativePath(vscode.Uri.joinPath(file, '..')), description: `${origin.layout}@${origin.ref}`, folders: [vscode.Uri.joinPath(file, '..')] });
      }
    }
    if (copies.length === 0) {
      void vscode.window.showInformationMessage('Update Layout: no folder layouts/<name>/ of the workspace is a copy of a layout on GitHub with the field "origin" in its layout.json.');
      return undefined;
    }
    const all: CopyItem = { label: 'All layouts', description: `${copies.length} copies of layouts on GitHub`, folders: copies.flatMap((copy) => copy.folders) };
    const chosen = copies.length === 1 ? copies[0] : await vscode.window.showQuickPick([all, ...copies], { title: 'Update Layout', placeHolder: 'The copy of a layout on GitHub to update from its repository' });
    if (!chosen) {
      return undefined;
    }
    folders = chosen.folders;
  }
  const token = await githubToken();
  const fetch = fetcher(`nimblescape-markdownpaper/${context.version ?? '0'}`);
  const short = (commit: string): string => commit.slice(0, 7);
  const messages: string[] = [];
  for (const folder of folders) {
    const name = vscode.workspace.asRelativePath(folder);
    try {
      const update = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Update Layout: reading the repository of ${name}` }, async () =>
        planUpdate(fetch, await readFolder(folder), { ...(token ? { token } : {}), force: true }),
      );
      const { origin } = update;
      if (update.from === origin.commit) {
        messages.push(`${name} is up to date with ${origin.layout}@${origin.ref}.`);
        continue;
      }
      if (update.conflicts.length > 0) {
        const replace = await vscode.window.showWarningMessage(
          `Update Layout: the project and ${origin.layout}@${origin.ref} changed the same parts of ${name}: ${update.conflicts.join(', ')}. Replace them with the versions of the repository?`,
          { modal: true },
          'Replace',
        );
        if (replace !== 'Replace') {
          messages.push(`${name} stays as it is.`);
          continue;
        }
      }
      await applyUpdate(folder, update);
      messages.push(`${name} is updated from ${short(update.from)} to ${short(origin.commit)}: ${update.changed.length > 0 ? update.changed.join(', ') : 'no file of the layout changed'}.${update.kept.length > 0 ? ` The changes of the project stay in ${update.kept.join(', ')}.` : ''}`);
    } catch (error) {
      messages.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  void vscode.window.showInformationMessage(`Update Layout: ${messages.join(' ')}`);
  return messages;
}

/** builtinFolder returns the URL of the folder of the built-in layouts, for the tests. */
export const builtinFolder = (extension: vscode.Uri): string => folderUrl(vscode.Uri.joinPath(extension, 'layouts'));
