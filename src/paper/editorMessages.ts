// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The messages between the two parts of the plugin `paper` of the editor of rendered Markdown of nimblescape Markdown
 * ([R-EDIT-001](../../docs/requirements.md#r-edit-001)): the part on the page of the editor (src/editor/paperPlugin.ts)
 * and the part in the extension (src/editorParts.ts), through the channel of the plugin. The page asks for the schema of
 * the front matter, opens the clone of a reference, asks for a citation and asks for the change that inserts a list of a
 * special section; the extension sends the schema of the layout of the document, the chosen citation and the change.
 * The module imports nothing, so that the bundle of the plugins of the editor holds no more than these messages.
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
  /**
   * cite asks for a citation of a source, which the user chooses in VS Code: in the sentence for the form "narrative",
   * else in parentheses, and the link before the cursor that the citation may join.
   */
  | { type: 'cite'; request: number; form?: 'narrative'; before?: { id: string; title: string } }
  /** list asks for the change of the text of the file that inserts a list of a special section at a place, for `/toc`, `/lof`, `/lot` and `/lol`. */
  | { type: 'list'; request: number; code: ListCode; text: string; at: number };

/** ExtensionMessage is a message of the extension to the page. */
export type ExtensionMessage =
  /** schema is the JSON schema of the front matter of the layout of the document, or null for a document that is no paper. */
  | { type: 'schema'; schema: Record<string, unknown> | null }
  /**
   * citation answers a request `cite`: the identifier of the source and the text of its citation, or none, and how it
   * joins the link before the cursor: ", " as a work of the same authors, "; " as another source in its parentheses.
   */
  | { type: 'citation'; request: number; id?: string; text?: string; join?: ', ' | '; ' }
  /**
   * listChange answers a request `list`: the change of the text of the file and the range of the text of the heading in
   * the text of the change, or none.
   */
  | { type: 'listChange'; request: number; change?: { from: number; to: number; text: string; heading: { from: number; to: number } } };

/** ListCode is the code of a special section with a list. */
export type ListCode = 'TOC' | 'LOF' | 'LOT' | 'LOL';

/** listCodeOf returns the code of a special section with a list, or undefined for another value. */
const listCodeOf = (value: unknown): ListCode | undefined => (value === 'TOC' || value === 'LOF' || value === 'LOT' || value === 'LOL' ? value : undefined);

/** isOffset returns true for a place in a text: a whole number that is not negative. */
const isOffset = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

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
    const before = isObject(value.before) && typeof value.before.id === 'string' && typeof value.before.title === 'string' ? { id: value.before.id, title: value.before.title } : undefined;
    return { type: 'cite', request: value.request as number, ...(value.form === 'narrative' ? { form: 'narrative' as const } : {}), ...(before ? { before } : {}) };
  }
  const code = listCodeOf(value.code);
  if (value.type === 'list' && Number.isInteger(value.request) && code && typeof value.text === 'string' && isOffset(value.at)) {
    return { type: 'list', request: value.request as number, code, text: value.text, at: value.at };
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
    const join = found && (value.join === ', ' || value.join === '; ') ? value.join : undefined;
    return { type: 'citation', request: value.request as number, ...(found ? { id: value.id as string, text: value.text as string } : {}), ...(join ? { join } : {}) };
  }
  if (value.type === 'listChange' && Number.isInteger(value.request)) {
    const change = isObject(value.change) ? value.change : undefined;
    const heading = change && isObject(change.heading) ? change.heading : undefined;
    const valid =
      change !== undefined && heading !== undefined && isOffset(change.from) && isOffset(change.to) && change.to >= change.from && typeof change.text === 'string' && isOffset(heading.from) && isOffset(heading.to);
    return {
      type: 'listChange',
      request: value.request as number,
      ...(valid ? { change: { from: change.from as number, to: change.to as number, text: change.text as string, heading: { from: heading.from as number, to: heading.to as number } } } : {}),
    };
  }
  return undefined;
}
