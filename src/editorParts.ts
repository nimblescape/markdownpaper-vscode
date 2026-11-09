// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The part in this extension of the plugin `paper` of the editor of rendered Markdown of nimblescape Markdown, in the
 * editor of a whole file of Markdown Notes ([R-EDIT-001](../docs/requirements.md#r-edit-001)). The part on the page is
 * src/editor/paperPlugin.ts; src/paper/editorMessages.ts defines their messages. For each panel of the editor, this part
 * sends the JSON schema of the front matter of the layout of the document (src/paper/frontMatterSchema.ts) after the page
 * asks for it, and again after a change of the field `layout` or of a file of a layout. It opens the clone of a
 * reference of the front matter with "Open Repository in New Window", and lets the user choose the source of a citation
 * in the list of `/cite`, which merges an item of Zotero into the database of the file; the page inserts the citation.
 * For `/toc`, `/lof`, `/lot` and `/lol` it sends the change of the text of the file that inserts the list of the special
 * section (src/listCommands.ts), which the page makes as a change of the user.
 */

import type { Layout } from '@nimblescape/markdownlayout';
import * as vscode from 'vscode';
import { citationFor, type CiteContext } from './cite';
import { listChange } from './listCommands';
import { type EditorPanelChannel, type FrontMatterRules, registerWithNotes } from './notesApi';
import { editorPluginName, type ExtensionMessage, pageMessage } from './paper/editorMessages';
import { isPaperDocument, readFrontMatter } from './paper/frontMatter';
import { frontMatterSchemaOf } from './paper/frontMatterSchema';
import { referencesOf } from './paper/references';
import { findLayout } from './paper/render';
import { searchHost } from './workspaceHost';

/** EditorPartsContext is what the part of the plugin needs from the extension. */
export interface EditorPartsContext {
  /** extension is the folder of the extension, with the built-in layouts. */
  extension: vscode.Uri;
  /** citations is the context of `/cite`. */
  citations: CiteContext;
  /** openRepository is the ID of the command "Open Repository in New Window". */
  openRepository: string;
}

/**
 * layoutOf finds the layout of a text: the layout of its field `layout`, else the built-in layout plain.
 * @param extension - The folder of the extension.
 * @param file - The file.
 * @param text - The text of the file.
 */
export async function layoutOf(extension: vscode.Uri, file: vscode.Uri, text: string): Promise<{ layout?: Layout; problem: string }> {
  const name = readFrontMatter(text)?.values.layout?.trim() || 'plain';
  const found = await findLayout(searchHost(extension, file), file.toString(), name);
  const errors = found.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);
  return { ...(found.layout ? { layout: found.layout } : {}), problem: errors.join(' ') };
}

/**
 * schemaOf returns the JSON schema of the front matter of a document: the schema of its layout, or null for a document
 * that is no paper and for a layout that the extension cannot read.
 * @param context - The context.
 * @param document - The document.
 */
export async function schemaOf(context: EditorPartsContext, document: vscode.TextDocument): Promise<Record<string, unknown> | null> {
  const text = document.getText();
  if (!isPaperDocument(text)) {
    return null;
  }
  const { layout } = await layoutOf(context.extension, document.uri, text);
  return layout ? frontMatterSchemaOf(layout) : null;
}

/**
 * connectPanel connects the part of the plugin in one panel of the editor.
 * @param context - The context.
 * @param channel - The channel of the plugin in the panel.
 * @returns What to dispose when the panel closes or the plugin goes.
 */
export function connectPanel(context: EditorPartsContext, channel: EditorPanelChannel): vscode.Disposable {
  const { document } = channel;
  const post = (message: ExtensionMessage): void => void channel.post(message);
  const layoutValue = (): string => readFrontMatter(document.getText())?.values.layout?.trim() ?? '';
  // The page asks for the schema once it listens; until then, a change sends nothing.
  let listening = false;
  let shown: string | undefined;
  let version = 0;
  const sendSchema = async (): Promise<void> => {
    const current = ++version;
    shown = layoutValue();
    const schema = await schemaOf(context, document).catch(() => null);
    if (current === version) {
      post({ type: 'schema', schema });
    }
  };
  const watcher = vscode.workspace.createFileSystemWatcher('**/layouts/**');
  const layoutChanged = (): void => {
    if (listening) {
      void sendSchema();
    }
  };
  return vscode.Disposable.from(
    watcher,
    watcher.onDidChange(layoutChanged),
    watcher.onDidCreate(layoutChanged),
    watcher.onDidDelete(layoutChanged),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (listening && event.document === document && layoutValue() !== shown) {
        void sendSchema();
      }
    }),
    channel.onMessage((value) => {
      const message = pageMessage(value);
      if (message?.type === 'hello') {
        listening = true;
        void sendSchema();
      } else if (message?.type === 'openReference') {
        const reference = referencesOf(document.getText()).references.find((one) => one.key === message.key && (message.key === 'layout' || one.name === message.name));
        if (reference) {
          void vscode.commands.executeCommand(context.openRepository, document.uri.toString(), reference.name);
        }
      } else if (message?.type === 'cite') {
        void citationFor(context.citations, document.uri, message.form ?? 'parenthetical', message.before)
          .catch(() => undefined)
          .then((found) => post({ type: 'citation', request: message.request, ...found }));
      } else if (message?.type === 'list') {
        // The page sends the text of the file, so the list comes from the text at the place of the cursor.
        void listChange(context.citations.formatStep, document.uri, message.code, message.text, message.at, false)
          .catch(() => undefined)
          .then((change) => post({ type: 'listChange', request: message.request, ...(change ? { change } : {}) }));
      }
    }),
  );
}

/**
 * rulesOf returns the rules of the front matter of a paper for the clean editing view of Markdown Notes: the schema of
 * its layout, and `repos`, which only `mp get` writes, as a read-only key besides `layout`, which the schema marks
 * read-only ([R-DOC-005](../docs/requirements.md#r-doc-005)). A document that is no paper gets none.
 * @param extension - The folder of the extension.
 * @param file - The file.
 * @param text - The text of the file.
 */
export async function rulesOf(extension: vscode.Uri, file: vscode.Uri, text: string): Promise<FrontMatterRules | undefined> {
  if (!isPaperDocument(text)) {
    return undefined;
  }
  const { layout } = await layoutOf(extension, file, text);
  return layout ? { schema: frontMatterSchemaOf(layout), readOnly: ['repos'] } : undefined;
}

/** schemaInNotes tells whether Markdown Notes took the rules of the front matter of the papers. */
let schemaInNotes = false;

/**
 * notesChecksFrontMatter tells whether Markdown Notes checks the front matter of a paper against its schema in its clean
 * editing view, so that the checks of this extension leave out the same problems there
 * ([R-DOC-002](../docs/requirements.md#r-doc-002)).
 */
export const notesChecksFrontMatter = (): boolean => schemaInNotes;

/**
 * registerFrontMatterRules gives the clean editing view of Markdown Notes the rules of the front matter of each paper,
 * again after a change of a file of a layout, when Markdown Notes has `registerFrontMatterSchema`.
 * @param extension - The folder of the extension.
 * @returns The registration.
 */
export function registerFrontMatterRules(extension: vscode.Uri): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher('**/layouts/**');
  const changes = new vscode.EventEmitter<void>();
  const changed = (): void => changes.fire();
  return vscode.Disposable.from(
    watcher,
    changes,
    watcher.onDidChange(changed),
    watcher.onDidCreate(changed),
    watcher.onDidDelete(changed),
    registerWithNotes((api) => {
      const registration = api.registerFrontMatterSchema?.({ schemaOf: (file, text) => rulesOf(extension, file, text).catch(() => undefined), onDidChange: changes.event });
      if (!registration) {
        return undefined;
      }
      schemaInNotes = true;
      return new vscode.Disposable(() => {
        schemaInNotes = false;
        registration.dispose();
      });
    }),
  );
}

/**
 * registerEditorParts connects the part of the plugin in the editor of a whole file of Markdown Notes, when Markdown
 * Notes has `registerEditorPlugin`.
 * @param context - The context.
 * @returns The registration, which disconnects the part when it is disposed.
 */
export function registerEditorParts(context: EditorPartsContext): vscode.Disposable {
  return registerWithNotes((api) => api.registerEditorPlugin?.(editorPluginName, (channel) => connectPanel(context, channel)));
}
