// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The parts of the paper in the editor of Markdown Notes, through its interface
 * ([R-GEN-003](../docs/requirements.md#r-gen-003)): the clean editing view leaves out the database of the sources
 * ([R-CITE-001](../docs/requirements.md#r-cite-001)) and the start markers of the arguments to research, and the
 * slash command `/research` marks a selected argument for an AI agent, and `/cite` of [cite.ts](cite.ts) inserts a
 * citation ([R-CITE-002](../docs/requirements.md#r-cite-002)). Markdown Notes knows nothing of them; without Markdown Notes, or
 * with a version without a function, the part is missing.
 */

import * as vscode from 'vscode';
import { fileOf, type NotesApiV1, registerWithNotes, type SlashCommand, textOf } from './notesApi';
import { findDatabase, researchEdit, researchMarkers, researchMark, researchText } from './paper/citations';
import { isPaperDocument } from './paper/frontMatter';

/**
 * hiddenDatabase returns the database of the sources as a block for the clean editing view, when it is the end of the
 * file: Markdown Notes keeps a hidden block at the end of the file.
 * @param lines - The lines of the file.
 */
export function hiddenDatabase(lines: readonly string[]): { first: number; last: number }[] {
  const database = findDatabase(lines);
  return database && lines.slice(database.end + 1).every((line) => line.trim() === '') ? [{ first: database.start, last: database.end }] : [];
}

/**
 * research marks the selected argument of a paper document for an AI agent: the hidden start marker before it, and
 * `(RESEARCH)` at its end, before a punctuation mark at its end. Another document, or a selection that is no argument,
 * gets a message and no edit.
 * @param editor - The text editor, also of the clean editing view of Markdown Notes.
 * @param range - The range of the selected text.
 * @returns Whether the argument got its marks.
 */
export async function research(editor: vscode.TextEditor, range: vscode.Range): Promise<boolean> {
  const document = editor.document;
  if (!isPaperDocument(await textOf(fileOf(document.uri)))) {
    void vscode.window.showInformationMessage('/research works in a paper document: a Markdown file with the field "layout" in its front matter.');
    return false;
  }
  const edit = researchEdit(document.getText(range));
  if (typeof edit === 'string') {
    void vscode.window.showInformationMessage(edit);
    return false;
  }
  const offset = document.offsetAt(range.start);
  const start = document.positionAt(offset + edit.start);
  const end = document.positionAt(offset + edit.end);
  return editor.edit((builder) => {
    builder.insert(end, ` ${researchText}`);
    builder.insert(start, `<wbr>${researchMark}`);
  });
}

/** researchCommand is the slash command `/research`, on selected text. */
export const researchCommand: SlashCommand = {
  label: '/research',
  description: 'Research the evidence for the argument',
  detail: 'An AI agent finds sources that support the selected argument and cites them here.',
  selection: true,
  run: (editor, range) => research(editor, range),
};

/**
 * registerNotesParts adds the parts of the paper to Markdown Notes. A part that Markdown Notes does not have or refuses
 * is left out; the others stay.
 * @param slashCommands - More slash commands, such as `/cite`, which need the context of the extension.
 * @returns The registration, which removes the parts when it is disposed.
 */
export function registerNotesParts(slashCommands: readonly SlashCommand[] = []): vscode.Disposable {
  return registerWithNotes((api: NotesApiV1) => {
    const parts: vscode.Disposable[] = [];
    const add = (register: () => vscode.Disposable | undefined) => {
      try {
        const part = register();
        if (part) {
          parts.push(part);
        }
      } catch {
        // Markdown Notes refused the part, for example a slash command with a label that it has.
      }
    };
    add(() => api.registerHiddenBlocks?.({ find: hiddenDatabase }));
    add(() => api.registerHiddenMarkers?.({ find: researchMarkers }));
    add(() => api.registerSlashCommand?.(researchCommand));
    for (const command of slashCommands) {
      add(() => api.registerSlashCommand?.(command));
    }
    return vscode.Disposable.from(...parts);
  });
}
