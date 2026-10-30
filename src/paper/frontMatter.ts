// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The front matter of a Markdown file: the YAML block between two lines `---` at the start of the file
 * ([R-DOC-001](../../docs/requirements.md#r-doc-001)). It names the layout of the document (`layout`) and holds the
 * fields of the layout, for example the title and the author, which the templates of the layout show. The module uses
 * no API of VS Code.
 */

import { isMap, isScalar, LineCounter, parseDocument } from 'yaml';

/** Field is one field of the front matter: its key, its value as text, and the lines of its key. */
export interface Field {
  /** key is the name of the field. */
  key: string;
  /** value is the value as text: a number or a boolean as YAML writes it, a list as its items joined by ", ". */
  value: string;
  /** line is the line of the key, counted from 0 in the file. */
  line: number;
  /** column is the column of the key in its line. */
  column: number;
}

/** FrontMatter is the front matter of a file. */
export interface FrontMatter {
  /** fields are the fields with a value that is no map, in the order of the file. */
  fields: Field[];
  /** values maps each key of `fields` to its value. */
  values: Record<string, string>;
  /** start is the line of the first `---`, counted from 0; end is the line of the closing `---` or `...`. */
  start: number;
  end: number;
  /** errors are the problems of the YAML, each with its line. */
  errors: { message: string; line: number }[];
}

/** opening matches the first line of a front matter. */
const opening = /^---[ \t]*$/;

/** closing matches the last line of a front matter. */
const closing = /^(?:---|\.\.\.)[ \t]*$/;

/**
 * textOf returns the value of a YAML node as text, or undefined for a map or a missing value.
 * @param node - The node.
 */
function textOf(node: unknown): string | undefined {
  if (isScalar(node)) {
    return node.value === null || node.value === undefined ? '' : String(node.value);
  }
  if (node && typeof node === 'object' && 'items' in node && Array.isArray((node as { items: unknown[] }).items) && !isMap(node)) {
    return (node as { items: unknown[] }).items.map((item) => textOf(item) ?? '').join(', ');
  }
  return undefined;
}

/**
 * readFrontMatter returns the front matter of a Markdown text, or undefined when the text has none. A front matter
 * starts in the first line with `---` and ends with the next line `---` or `...`.
 * @param text - The Markdown text.
 */
export function readFrontMatter(text: string): FrontMatter | undefined {
  const lines = text.split(/\r?\n/);
  if (!opening.test(lines[0] ?? '')) {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > 0 && closing.test(line));
  if (end < 0) {
    return undefined;
  }
  const yaml = lines.slice(1, end).join('\n');
  const counter = new LineCounter();
  const document = parseDocument(yaml, { lineCounter: counter, prettyErrors: false, uniqueKeys: true });
  const errors = document.errors.map((error) => ({ message: error.message.split('\n')[0], line: counter.linePos(error.pos[0]).line }));
  const fields: Field[] = [];
  if (isMap(document.contents)) {
    for (const pair of document.contents.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : undefined;
      const value = textOf(pair.value);
      if (key === undefined || value === undefined) {
        continue;
      }
      const offset = isScalar(pair.key) && pair.key.range ? pair.key.range[0] : 0;
      const position = counter.linePos(offset);
      fields.push({ key, value, line: position.line, column: position.col - 1 });
    }
  } else if (document.contents !== null && errors.length === 0) {
    errors.push({ message: 'The front matter is no map of fields.', line: 1 });
  }
  return { fields, values: Object.fromEntries(fields.map((field) => [field.key, field.value])), start: 0, end, errors };
}

/**
 * bodyOf returns the Markdown text after the front matter, with an empty line for each line of the front matter, so
 * that each line of the body keeps its number in the file.
 * @param text - The Markdown text.
 * @param frontMatter - The front matter of the text.
 */
export function bodyOf(text: string, frontMatter: FrontMatter | undefined): string {
  if (!frontMatter) {
    return text;
  }
  const lines = text.split(/\r?\n/);
  return [...lines.slice(0, frontMatter.end + 1).map(() => ''), ...lines.slice(frontMatter.end + 1)].join('\n');
}
