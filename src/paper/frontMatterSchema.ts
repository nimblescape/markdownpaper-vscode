// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The JSON schema of the front matter of a paper for the form of the front matter of the editor of rendered Markdown of
 * nimblescape Markdown ([R-EDIT-001](../../docs/requirements.md#r-edit-001)): the field `layout`, the fields of the
 * layout and `lang`, in the order of the view "Front Matter" ([R-DOC-005](../../docs/requirements.md#r-doc-005)). It is
 * standard JSON Schema (draft 2020-12), as the form reads it: each field of the layout is a text with its description,
 * its default and its values, and the required fields are required. `layout` is read-only, because `mp create` writes
 * it. `repos`, which `mp get` writes, is no key of the schema: the form shows it when the file has it, with the input of
 * the plugin. Other keys are allowed, because other extensions keep their keys in the front matter too. The function
 * `schemaOfFields` of the layout part of nimblescape Markdown makes the general schema of the fields; the schema of a
 * paper adds that `layout` is required and read-only, and the field `lang`. The module uses no API of VS Code.
 */

import type { Layout } from '@nimblescape/markdownlayout';

/** FrontMatterSchema is the JSON schema of the front matter of a paper. */
export type FrontMatterSchema = Record<string, unknown>;

/**
 * frontMatterSchemaOf returns the JSON schema of the front matter of the documents of a layout.
 * @param layout - The layout.
 */
export function frontMatterSchemaOf(layout: Pick<Layout, 'name' | 'fields' | 'language'>): FrontMatterSchema {
  const properties: Record<string, Record<string, unknown>> = {
    layout: { type: 'string', title: 'Layout', description: `The layout of the document: ${layout.name}. The command mp create writes it.`, readOnly: true },
  };
  for (const [key, field] of Object.entries(layout.fields)) {
    properties[key] = {
      type: 'string',
      ...(field.description ? { description: field.description } : {}),
      ...(field.default !== undefined ? { default: field.default } : {}),
      ...(field.values ? { enum: field.values } : {}),
    };
  }
  properties.lang ??= { type: 'string', description: `The language of the document, a tag such as de-AT or en-US. Without it, the document has the language of the layout, ${layout.language}.`, default: layout.language };
  const required = ['layout', ...Object.entries(layout.fields).flatMap(([key, field]) => (field.required ? [key] : []))];
  return { type: 'object', properties, required };
}
