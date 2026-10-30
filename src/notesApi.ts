// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The interface to the extension nimblescape Markdown Notes ([R-GEN-003](../docs/requirements.md#r-gen-003)): its
 * clean editing view shows a Markdown file with notes without their markup, in a document of its own scheme
 * (`markdown-notes`). The page preview and "Export PDF" must read the file itself, with its footnotes, so they ask
 * Markdown Notes for the file of such a document: `getAPI(1).fileOf(uri)` of its export, as the Git extension of
 * VS Code gives its API. A version of Markdown Notes without the API, or none at all, still works: then the file is
 * the open document with the same path in another scheme.
 */

import * as vscode from 'vscode';

/** notesExtensionId is the ID of the extension nimblescape Markdown Notes. */
export const notesExtensionId = 'nimblescape.nimblescape-markdownnotes';

/** cleanScheme is the scheme of the documents of the clean editing view of Markdown Notes. */
export const cleanScheme = 'markdown-notes';

/** NotesApiV1 is version 1 of the API of Markdown Notes, as its src/extension.ts defines it. */
export interface NotesApiV1 {
  readonly version: 1;
  /** fileOf returns the URI of the file of a document of the clean editing view, and undefined for another URI. */
  fileOf(document: vscode.Uri): vscode.Uri | undefined;
  /**
   * registerFormatStep adds a step to the formatter of Markdown Notes, after its own steps, until the disposal of the
   * result. An older version of Markdown Notes does not have it.
   */
  registerFormatStep?(step: { applies(lines: readonly string[], file: vscode.Uri): boolean; format(lines: readonly string[], file: vscode.Uri): readonly string[] }): vscode.Disposable;
}

/** NotesExports is the export of the extension Markdown Notes, as far as this extension reads it. */
interface NotesExports {
  getAPI?(version: number): NotesApiV1 | undefined;
}

/**
 * notesApi returns version 1 of the API of Markdown Notes when the extension is active and has it.
 */
export function notesApi(): NotesApiV1 | undefined {
  const extension = vscode.extensions.getExtension<NotesExports>(notesExtensionId);
  if (!extension?.isActive) {
    return undefined;
  }
  const api = extension.exports?.getAPI?.(1);
  return api?.version === 1 ? api : undefined;
}

/**
 * fileOf returns the URI of the file that a document shows: the document itself, or for a document of the clean
 * editing view of Markdown Notes its file.
 * @param document - The URI of the document.
 */
export function fileOf(document: vscode.Uri): vscode.Uri {
  if (document.scheme !== cleanScheme) {
    return document;
  }
  const file = notesApi()?.fileOf(document);
  if (file) {
    return file;
  }
  const open = vscode.workspace.textDocuments.find((candidate) => candidate.uri.scheme !== cleanScheme && candidate.uri.path === document.path);
  return open?.uri ?? document;
}

/**
 * textOf returns the text of a file: the open document with its unsaved changes, else the file on the disk.
 * @param file - The URI of the file.
 */
export async function textOf(file: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === file.toString());
  if (open) {
    return open.getText();
  }
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
}
