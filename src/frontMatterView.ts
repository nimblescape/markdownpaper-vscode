// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The view "Front Matter" in the side bar ([R-DOC-005](../docs/requirements.md#r-doc-005),
 * [decision 56](../docs/requirements.md#decisions)): a form of the front matter of the Markdown file in the active
 * editor, also of a file in the clean editing view of Markdown Notes, with one row for each field of its layout. The
 * view stands in the container of the view of Markdown Notes, and in the Explorer without Markdown Notes. Each change
 * of a row is one edit of the file, which the author can undo in the text editor of the file; a file without unsaved
 * changes is saved after the edit. The form keeps no copy: a change of the file, for example by `mp get`, shows at
 * once. The rows and the edits are in [paper/frontMatterForm.ts](paper/frontMatterForm.ts), the page of the view in
 * media/frontMatter.js and media/frontMatter.css.
 */

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { fileOf, textOf } from './notesApi';
import { readFrontMatter } from './paper/frontMatter';
import { applyChange, type Change, changedLines, type Form, formOf, orderOf } from './paper/frontMatterForm';
import type { Layout } from './paper/layout';
import { findLayout } from './paper/render';
import { searchHost } from './workspaceHost';

/** frontMatterViewId is the ID of the view. */
export const frontMatterViewId = 'nimblescape.markdownPaper.frontMatter';

/** readOnlyKeys are the keys that only the command mp writes: `layout` (mp create) and `repos` (mp get). */
const readOnlyKeys = new Set(['layout', 'repos']);

/**
 * layoutOf finds the layout of a text: the layout of its field `layout`, else the built-in layout plain.
 * @param extension - The folder of the extension.
 * @param file - The file.
 * @param text - The text of the file.
 */
async function layoutOf(extension: vscode.Uri, file: vscode.Uri, text: string): Promise<{ layout?: Layout; problem: string }> {
  const name = readFrontMatter(text)?.values.layout?.trim() || 'plain';
  const found = await findLayout(searchHost(extension, file), file.toString(), name);
  const errors = found.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);
  return { ...(found.layout ? { layout: found.layout } : {}), problem: errors.join(' ') };
}

/**
 * formFor returns the form of the front matter of a file.
 * @param extension - The folder of the extension.
 * @param file - The file.
 */
export async function formFor(extension: vscode.Uri, file: vscode.Uri): Promise<Form> {
  const text = await textOf(file);
  const { layout, problem } = await layoutOf(extension, file, text);
  return formOf(text, path.basename(file.path), layout, problem);
}

/**
 * applyFrontMatterChange writes a change of the form into a file as one edit of its document, which replaces only the
 * changed lines, and saves the file when it had no unsaved changes before. `layout` and `repos`, and a front matter
 * with problems, stay as they are.
 * @param extension - The folder of the extension.
 * @param file - The file.
 * @param change - The change.
 * @returns Whether the file changed.
 */
export async function applyFrontMatterChange(extension: vscode.Uri, file: vscode.Uri, change: Change): Promise<boolean> {
  if (readOnlyKeys.has(change.key)) {
    return false;
  }
  const document = await vscode.workspace.openTextDocument(file);
  const text = document.getText();
  const { layout, problem } = await layoutOf(extension, file, text);
  if (formOf(text, path.basename(file.path), layout, problem).problems.length > 0) {
    return false;
  }
  const next = applyChange(text, { key: change.key, value: change.value.trim() }, orderOf(layout));
  if (next === text) {
    return false;
  }
  const changed = changedLines(text, next);
  const newline = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const edit = new vscode.WorkspaceEdit();
  if (changed.end < document.lineCount) {
    edit.replace(file, new vscode.Range(changed.start, 0, changed.end, 0), changed.lines.map((line) => `${line}${newline}`).join(''));
  } else {
    edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), next);
  }
  const dirty = document.isDirty;
  if (!(await vscode.workspace.applyEdit(edit))) {
    return false;
  }
  if (!dirty) {
    await document.save();
  }
  return true;
}

/** Message is a message of the page of the view. */
type Message = { type: 'ready' } | { type: 'change'; key: string; value: string };

/** FrontMatterView is the provider of the view; it follows the Markdown file of the active editor. */
export class FrontMatterView implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private view: vscode.WebviewView | undefined;
  private current: vscode.Uri | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  /** generation counts the updates, so that a slow update does not write over a newer one. */
  private generation = 0;

  constructor(private readonly extension: vscode.Uri) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => this.follow(editor)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.current && event.contentChanges.length > 0 && fileOf(event.document.uri).toString() === this.current.toString()) {
          void this.update();
        }
      }),
    );
    this.follow(vscode.window.activeTextEditor);
  }

  /** file is the file whose front matter the view shows. */
  get file(): vscode.Uri | undefined {
    return this.current;
  }

  /** shown is true while the page of the view exists. */
  get shown(): boolean {
    return this.view !== undefined;
  }

  /**
   * follow shows the file of an editor when it is a Markdown file; another editor keeps the file of the view.
   * @param editor - The editor.
   */
  private follow(editor: vscode.TextEditor | undefined): void {
    if (editor && editor.document.languageId === 'markdown') {
      this.show(fileOf(editor.document.uri));
    }
  }

  /**
   * show shows the front matter of a file.
   * @param file - The file.
   */
  show(file: vscode.Uri): void {
    if (this.current?.toString() !== file.toString()) {
      this.current = file;
      this.watcher?.dispose();
      this.watcher = undefined;
      // A change on the disk, for example by mp get, when no editor has the file.
      if (file.scheme === 'file') {
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(file, '..'), path.basename(file.path)));
        this.watcher.onDidChange(() => void this.update());
        this.watcher.onDidCreate(() => void this.update());
      }
    }
    void this.update();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extension, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const nonce = randomBytes(16).toString('hex');
    const script = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'frontMatter.js'));
    const style = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'frontMatter.css'));
    view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style.toString()}">
<title>Front Matter</title>
</head>
<body>
<div id="form"></div>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: Message) => void this.receive(message)),
      view.onDidChangeVisibility(() => void this.update()),
      view.onDidDispose(() => {
        this.view = undefined;
      }),
    );
  }

  /**
   * receive handles a message of the page.
   * @param message - The message.
   */
  private async receive(message: Message): Promise<void> {
    if (message.type === 'ready') {
      await this.update();
    } else if (message.type === 'change' && this.current) {
      try {
        await applyFrontMatterChange(this.extension, this.current, { key: String(message.key), value: String(message.value) });
      } catch (error) {
        void vscode.window.showErrorMessage(`Front Matter: ${error instanceof Error ? error.message : String(error)}`);
      }
      // The page shows the file again, also when nothing changed, so that a refused value goes back.
      await this.update();
    }
  }

  /** update sends the form of the file to the page. */
  private async update(): Promise<void> {
    const view = this.view;
    if (!view?.visible) {
      return;
    }
    const generation = ++this.generation;
    let form: Form | undefined;
    try {
      form = this.current ? await formFor(this.extension, this.current) : undefined;
    } catch {
      form = undefined;
    }
    if (generation === this.generation) {
      void view.webview.postMessage({ type: 'form', form: form ?? null });
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
