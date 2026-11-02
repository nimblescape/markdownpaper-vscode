// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The messages between the two parts of the plugin `paper` of the editor of rendered Markdown of nimblescape Markdown
 * ([R-EDIT-001](../../docs/requirements.md#r-edit-001)): the part on the page of the editor (src/editor/paperPlugin.ts)
 * and the part in the extension (src/editorParts.ts), through the channel of the plugin. The page asks for the schema of
 * the front matter, opens the clone of a reference and asks for a citation; the extension sends the schema of the
 * layout of the document and the chosen citation. The module imports nothing, so that the bundle of the plugins of the
 * editor holds no more than these messages.
 */

/** editorPluginName is the name of the plugin of the editor, and of its channel. */
export const editorPluginName = 'paper';

/** PageMessage is a message of the page to the extension. */
export type PageMessage =
  /** hello asks for the schema of the front matter, after the plugin started on the page. */
  | { type: 'hello' }
  /** openReference opens the clone of a reference of the front matter: of `layout`, or of an entry of `repos`. */
  | { type: 'openReference'; key: 'layout' }
  | { type: 'openReference'; key: 'repos'; name: string }
  /** cite asks for a citation of a source, which the user chooses in VS Code. */
  | { type: 'cite'; request: number };

/** ExtensionMessage is a message of the extension to the page. */
export type ExtensionMessage =
  /** schema is the JSON schema of the front matter of the layout of the document, or null for a document that is no paper. */
  | { type: 'schema'; schema: Record<string, unknown> | null }
  /** citation answers a request `cite`: the identifier of the source and the text of its citation, or none. */
  | { type: 'citation'; request: number; id?: string; text?: string };

/** isObject returns true for an object that is no list. */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * pageMessage returns a message of the page, or undefined for another value.
 * @param value - The message.
 */
export function pageMessage(value: unknown): PageMessage | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value.type === 'hello') {
    return { type: 'hello' };
  }
  if (value.type === 'openReference' && value.key === 'layout') {
    return { type: 'openReference', key: 'layout' };
  }
  if (value.type === 'openReference' && value.key === 'repos' && typeof value.name === 'string') {
    return { type: 'openReference', key: 'repos', name: value.name };
  }
  if (value.type === 'cite' && Number.isInteger(value.request)) {
    return { type: 'cite', request: value.request as number };
  }
  return undefined;
}

/**
 * extensionMessage returns a message of the extension, or undefined for another value.
 * @param value - The message.
 */
export function extensionMessage(value: unknown): ExtensionMessage | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value.type === 'schema' && (value.schema === null || isObject(value.schema))) {
    return { type: 'schema', schema: value.schema };
  }
  if (value.type === 'citation' && Number.isInteger(value.request)) {
    const found = typeof value.id === 'string' && typeof value.text === 'string';
    return { type: 'citation', request: value.request as number, ...(found ? { id: value.id as string, text: value.text as string } : {}) };
  }
  return undefined;
}
