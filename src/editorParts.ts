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
 */

import * as vscode from 'vscode';
import { citationFor, type CiteContext } from './cite';
import { layoutOf } from './frontMatterView';
import { type EditorPanelChannel, registerWithNotes } from './notesApi';
import { editorPluginName, type ExtensionMessage, pageMessage } from './paper/editorMessages';
import { isPaperDocument, readFrontMatter } from './paper/frontMatter';
import { frontMatterSchemaOf } from './paper/frontMatterSchema';
import { referencesOf } from './paper/references';

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
        void citationFor(context.citations, document.uri)
          .catch(() => undefined)
          .then((found) => post({ type: 'citation', request: message.request, ...found }));
      }
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
