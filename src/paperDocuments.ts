// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Paper documents and notes documents ([R-DOC-004](../docs/requirements.md#r-doc-004)): while the active editor shows
 * a paper document, the context key `paperDocument` of the extension is true, and the title bar shows the button
 * "Export PDF". A notes document shows no such button. The active editor is the text editor, or one of the two other
 * views of a Markdown file of Markdown Notes, "Markdown Preview" and "Markdown Editor", which are custom editors of the
 * file. Another editor, such as the Markdown preview to the side, keeps the key of the last view, so the button "Export
 * PDF" stays on the preview of a paper.
 */

import * as vscode from 'vscode';
import { isPaperDocument } from './paper/frontMatter';

/** paperDocumentKey is the context key that is true while the active editor shows a paper document. */
export const paperDocumentKey = 'nimblescape.markdownPaper.paperDocument';

/** markdownPreviewEditor is the custom editor of VS Code of the view "Markdown Preview" of a Markdown file. */
export const markdownPreviewEditor = 'vscode.markdown.preview.editor';

/** markdownEditor is the custom editor of Markdown Notes of the view "Markdown Editor" of a Markdown file. */
export const markdownEditor = 'nimblescape.markdownNotes.editor';

/**
 * activeViewFile returns the file of the active tab when the tab is the view "Markdown Preview" or "Markdown Editor"
 * of a Markdown file, and undefined for any other tab, such as a text editor.
 */
export function activeViewFile(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom && (input.viewType === markdownPreviewEditor || input.viewType === markdownEditor) ? input.uri : undefined;
}

/** PaperDocuments keeps the context key in step with the active editor and its text. */
export class PaperDocuments implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private paper: boolean | undefined;
  /** file is the file of the active view, for which `update` runs. */
  private file: string | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document || event.document.uri.toString() === activeViewFile()?.toString()) {
          this.update();
        }
      }),
    );
    this.update();
  }

  /** update sets the context key for the document of the active editor. */
  private update(): void {
    const file = activeViewFile();
    if (file) {
      // A custom editor of a text file holds its document open; the document can still be loading.
      const key = file.toString();
      this.file = key;
      const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
      if (open) {
        this.set(open);
      } else {
        void Promise.resolve(vscode.workspace.openTextDocument(file)).then(
          (document) => this.file === key && this.set(document),
          () => undefined,
        );
      }
      return;
    }
    this.file = undefined;
    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      this.set(document);
    }
  }

  /** set sets the context key for a document. */
  private set(document: vscode.TextDocument): void {
    const paper = document.languageId === 'markdown' && isPaperDocument(document.getText());
    if (paper !== this.paper) {
      this.paper = paper;
      void vscode.commands.executeCommand('setContext', paperDocumentKey, paper);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
