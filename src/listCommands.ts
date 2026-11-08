// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The slash commands of the lists of the special sections ([R-REN-004](../docs/requirements.md#r-ren-004)): `/toc`,
 * `/lof`, `/lot` and `/lol` insert the heading of the table of contents, the list of figures, the list of tables or the
 * list of listings in the language of the layout, with the list between its markers, as the format step writes it. In
 * the text editor, also in the clean editing view of Markdown Notes, the commands come through the API of Markdown
 * Notes; in the editor of a whole file, the page asks for the change ([src/editorParts.ts](editorParts.ts)). The format
 * step keeps the list current at each save.
 */

import * as vscode from 'vscode';
import type { PaperFormatStep } from './formatStep';
import { fileOf, type SlashCommand, textOf } from './notesApi';
import { isPaperDocument } from './paper/frontMatter';
import { type ListCode, type ListInsertion, listInsertion } from './paper/lists';
import { listCodes } from './paper/marks';

/** listNames are the names of the lists of the special sections, by their codes. */
export const listNames: Record<ListCode, string> = { TOC: 'table of contents', LOF: 'list of figures', LOT: 'list of tables', LOL: 'list of listings' };

/**
 * listChange returns the change of the text of an editor that inserts the special section of a list at a place, or
 * undefined after a message to the user: for a document that is no paper, before the layout of the paper is read, and
 * for a paper that has the section already.
 * @param formatStep - The format step, which has the layouts of the open paper documents.
 * @param file - The file of the paper.
 * @param code - The code of the section.
 * @param text - The text of the editor.
 * @param at - The place in the text, for example the cursor.
 * @param clean - Tells whether the text is the clean text of the clean editing view, which leaves out hidden parts of the file.
 */
export async function listChange(formatStep: PaperFormatStep, file: vscode.Uri, code: ListCode, text: string, at: number, clean: boolean): Promise<ListInsertion | undefined> {
  const source = clean ? await textOf(file) : text;
  const command = `/${listCodes[code]}`;
  if (!isPaperDocument(source)) {
    void vscode.window.showInformationMessage(`${command} works in a paper document: a Markdown file with the field "layout" in its front matter.`);
    return undefined;
  }
  const entry = formatStep.entryOf(source.split('\n'), file);
  if (!entry) {
    void vscode.window.showWarningMessage(`${command}: the layout of the paper is not read yet. Try again in a moment; the Problems view names a layout that cannot be read.`);
    return undefined;
  }
  const change = listInsertion(text, at, code, entry.layout, clean ? source : undefined);
  if ('exists' in change) {
    const place = `under the heading in line ${change.exists + 1} of the file`;
    void vscode.window.showInformationMessage(
      change.marked
        ? `The paper has the markers of its ${listNames[code]} already, ${place}. Give this heading a word of the ${listNames[code]} in the language of the layout, or the code {${code}} at its end, so that the formatter keeps the list current.`
        : `The paper has its ${listNames[code]} already, ${place}. The formatter keeps it current.`,
    );
    return undefined;
  }
  return change;
}

/**
 * insertList inserts the special section of a list at the cursor of a text editor and puts the cursor at the end of its
 * heading.
 * @param formatStep - The format step.
 * @param code - The code of the section.
 * @param editor - The text editor, also of the clean editing view.
 * @param range - The place of the typed command.
 * @returns Whether the section was inserted.
 */
async function insertList(formatStep: PaperFormatStep, code: ListCode, editor: vscode.TextEditor, range: vscode.Range): Promise<boolean> {
  const { document } = editor;
  const file = fileOf(document.uri);
  const change = await listChange(formatStep, file, code, document.getText(), document.offsetAt(range.start), file.toString() !== document.uri.toString());
  if (!change) {
    return false;
  }
  const start = document.positionAt(change.from);
  if (!(await editor.edit((builder) => builder.replace(new vscode.Range(start, document.positionAt(change.to)), change.text)))) {
    return false;
  }
  const before = change.text.slice(0, change.heading.to);
  const line = start.line + before.split('\n').length - 1;
  const character = before.includes('\n') ? before.length - before.lastIndexOf('\n') - 1 : start.character + before.length;
  const end = new vscode.Position(line, character);
  editor.selection = new vscode.Selection(end, end);
  editor.revealRange(new vscode.Range(end, end));
  return true;
}

/**
 * listCommands returns the slash commands `/toc`, `/lof`, `/lot` and `/lol` of the text editor.
 * @param formatStep - The format step.
 */
export function listCommands(formatStep: PaperFormatStep): SlashCommand[] {
  return (Object.keys(listCodes) as ListCode[]).map((code) => ({
    label: `/${listCodes[code]}`,
    description: `Insert the ${listNames[code]}`,
    detail: `Inserts the heading of the ${listNames[code]} in the language of the layout and the list under it. The formatter keeps the list current at each save.`,
    run: (editor, range) => insertList(formatStep, code, editor, range),
  }));
}
