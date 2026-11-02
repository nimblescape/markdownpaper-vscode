// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The links of the references of the front matter ([R-CLI-004](../docs/requirements.md#r-cli-004)): the value of
 * `layout` with a GitHub reference and each value of `repos` are links. Ctrl+click (Cmd+click on macOS) on one runs
 * "Open Repository in New Window" for that reference, which opens its clone in a new window of VS Code, or offers
 * `mp get` when the clone is missing. The links work in the text editor and in the clean editing view of Markdown
 * Notes, whose documents have the scheme `markdownnotes`.
 */

import * as vscode from 'vscode';
import { fileOf } from './notesApi';
import { clonesFolder, referenceRanges } from './paper/references';

/** referenceLinkSelector names the documents with the links: Markdown files, also in the clean editing view. */
export const referenceLinkSelector: vscode.DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'markdownnotes' },
];

/** ReferenceLinks gives the links of the references of the front matter of a document. */
export class ReferenceLinks implements vscode.DocumentLinkProvider {
  /**
   * @param command - The ID of the command "Open Repository in New Window".
   */
  constructor(private readonly command: string) {}

  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const file = fileOf(document.uri).toString();
    return referenceRanges(document.getText()).map(({ reference, line, start, end }) => {
      // The arguments of a command link are JSON, so the paper goes as the text of its URI.
      const target = vscode.Uri.parse(`command:${this.command}?${encodeURIComponent(JSON.stringify([file, reference.name]))}`);
      const link = new vscode.DocumentLink(new vscode.Range(line, start, line, end), target);
      link.tooltip = `Open ${clonesFolder}/${reference.name}/ in a new window`;
      return link;
    });
  }
}
