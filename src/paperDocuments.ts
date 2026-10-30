// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Paper documents and notes documents ([R-DOC-004](../docs/requirements.md#r-doc-004)): while the active text editor
 * shows a paper document, the context key `paperDocument` of the extension is true, and the title bar shows the
 * buttons "Show Page Preview" and "Export PDF". A notes document shows neither. Another editor, such as the Markdown
 * preview, keeps the key of the last text editor, so the button "Export PDF" stays on the preview of a paper.
 */

import * as vscode from 'vscode';
import { isPaperDocument } from './paper/frontMatter';

/** paperDocumentKey is the context key that is true while the active editor shows a paper document. */
export const paperDocumentKey = 'nimblescape.markdownPaper.paperDocument';

/** PaperDocuments keeps the context key in step with the active editor and its text. */
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

  /** update sets the context key for the document of the active editor. */
  private update(): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
      return;
    }
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
