// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Paper documents and notes documents ([R-DOC-004](../docs/requirements.md#r-doc-004),
 * [R-PRV-005](../docs/requirements.md#r-prv-005)): the page preview takes the place of the Markdown preview of VS Code
 * for a paper document. While the active editor shows a paper document, the context key `paperDocument` of the
 * extension turns the keys of the Markdown preview to the page preview, and the context key `hasCustomMarkdownPreview`,
 * which VS Code gives to an extension whose preview replaces its own, hides the buttons and menu items of the Markdown
 * preview of VS Code. A notes document keeps the Markdown preview of VS Code.
 */

import * as vscode from 'vscode';
import { isPaperDocument } from './paper/frontMatter';

/** paperDocumentKey is the context key that is true while the active editor shows a paper document. */
export const paperDocumentKey = 'nimblescape.markdownPaper.paperDocument';

/** customPreviewKey is the context key of VS Code that hides the buttons of its Markdown preview. */
export const customPreviewKey = 'hasCustomMarkdownPreview';

/** PaperDocuments keeps the context keys in step with the active editor and its text. */
export class PaperDocuments implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private paper: boolean | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          this.update();
        }
      }),
    );
    this.update();
  }

  /** update sets the context keys for the document of the active editor. */
  private update(): void {
    const document = vscode.window.activeTextEditor?.document;
    // Another editor, such as the page preview, keeps the keys of the last text editor.
    if (!document) {
      return;
    }
    const paper = document.languageId === 'markdown' && isPaperDocument(document.getText());
    if (paper === this.paper) {
      return;
    }
    // The extension sets the key of VS Code back only when it set the key itself, so it leaves the key of another
    // extension with a preview of its own alone as far as it can.
    const before = this.paper;
    this.paper = paper;
    void vscode.commands.executeCommand('setContext', paperDocumentKey, paper);
    if (paper || before) {
      void vscode.commands.executeCommand('setContext', customPreviewKey, paper);
    }
  }

  /**
   * isPaper tells whether a Markdown file is a paper document, by its open document or else by the file.
   * @param uri - The URI of the file.
   */
  async isPaper(uri: vscode.Uri): Promise<boolean> {
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open) {
      return isPaperDocument(open.getText());
    }
    try {
      return isPaperDocument(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.paper) {
      void vscode.commands.executeCommand('setContext', customPreviewKey, false);
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
