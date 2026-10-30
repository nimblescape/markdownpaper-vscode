// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The commands of the extension that write files: "Export PDF" ([R-PDF-001](../docs/requirements.md#r-pdf-001)) and
 * "New Project", "New Document" and "New Layout" ([R-NEW-001](../docs/requirements.md#r-new-001) to
 * [R-NEW-003](../docs/requirements.md#r-new-003)). They write no file over an existing one.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { fileOf, textOf } from './notesApi';
import type { Layout } from './paper/layout';
import { defaultLayout, findLayout, layoutName } from './paper/render';
import { type NewFile, newDocumentText, newLayoutFiles, newProjectFiles } from './paper/scaffold';
import { exportPdf } from './pdf/export';
import { folderUrl, readFolder, searchHost, workspaceReader } from './workspaceHost';

/** Context is what the commands need from the extension. */
export interface Context {
  extension: vscode.Uri;
  /** browserPath is the setting of the program of the browser. */
  browserPath(): string;
  /** openPdf is the setting that opens the PDF after the export. */
  openPdf(): boolean;
  /** previewFile is the file of the active page preview, if one is active. */
  previewFile(): vscode.Uri | undefined;
}

const decoder = new TextDecoder();

/**
 * targetOf returns the file of a command: the file of the Explorer, else of the active page preview, else of the
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
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Export PDF: ${path.basename(file.fsPath)}` }, async () =>
      exportPdf(file.fsPath, {
        assets: { layouts: vscode.Uri.joinPath(context.extension, 'layouts').fsPath, pagedJs: vscode.Uri.joinPath(context.extension, 'media', 'paged.polyfill.js').fsPath },
        text: await textOf(file),
        browser: context.browserPath(),
        ...(folder?.uri.scheme === 'file' ? { top: folder.uri.fsPath } : {}),
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
  const written = await writeNew(parent, [{ path: target.path.split('/').pop() ?? 'paper.md', content: newDocumentText(picked.layout, await startOf(picked.layout)) }]);
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
 * newProjectCommand writes a new project: AGENTS.md, a copy of a layout, the document and the folders of the sources
 * and of the images, and opens the document.
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
  const picked = await pickLayout(context, vscode.Uri.joinPath(target, 'paper', 'paper.md'), 'Layout of the project');
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
  const files = newProjectFiles({ layout: picked.layout, source: await readFolder(picked.folder), language: language || picked.layout.language, values }, await startOf(picked.layout));
  const written = await writeNew(target, files);
  if (!written) {
    return undefined;
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

/** builtinFolder returns the URL of the folder of the built-in layouts, for the tests. */
export const builtinFolder = (extension: vscode.Uri): string => folderUrl(vscode.Uri.joinPath(extension, 'layouts'));
