// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The form of the front matter ([R-DOC-005](../../docs/requirements.md#r-doc-005)): the rows of the view "Front
 * Matter" for the front matter of a file and the fields of its layout, and the changes of the text that a row makes.
 * The file stays the source: the form keeps no copy, and each change replaces only the lines of one field. The module
 * uses no API of VS Code.
 */

import { isMap, isScalar, LineCounter, type Node, parseDocument, stringify } from 'yaml';
import type { Layout } from './layout';

/** FieldRow is the row of a field of the layout. */
export interface FieldRow {
  key: string;
  description: string;
  required: boolean;
  /** value is the value of the file as text, or '' when the file has no value. */
  value: string;
  /** placeholder is the default of the field, or ''. */
  placeholder: string;
  /** values are the names of a parameter, for a choice list. */
  values?: string[];
  /** readOnly is true for a value that is no text, for example a list, which the text editor changes. */
  readOnly: boolean;
  /** warning is the problem of the value, as the checks name it, or ''. */
  warning: string;
}

/** Form is the content of the view "Front Matter" for a file. */
export interface Form {
  /** file is the name of the file. */
  file: string;
  /** layout is the value of the field `layout`, or '' without one; layoutName is the name of the layout for people. */
  layout: string;
  layoutName: string;
  /** repos are the entries of `repos`: their names and references, as the file has them. */
  repos: { name: string; reference: string }[];
  /** lang is the value of `lang`, and language the language of the layout, its placeholder. */
  lang: string;
  language: string;
  fields: FieldRow[];
  /** unknown are the keys of the file that the layout does not know, with their values as text. */
  unknown: { key: string; value: string }[];
  /** problems are the problems that stop the form, for example a YAML error; the rows are then read-only. */
  problems: string[];
}

/** Change is a change of a row of the form: a new value for a key, or '' to remove the key. */
export interface Change {
  key: string;
  value: string;
}

/** keysOfThePaper are the keys that every paper can have, besides the fields of its layout. */
const keysOfThePaper = ['layout', 'repos', 'lang'];

/** opening and closing match the lines around a front matter. */
const opening = /^---[ \t]*$/;
const closing = /^(?:---|\.\.\.)[ \t]*$/;

/** Yaml is the front matter of a text: its lines, the line of the closing `---`, and the parsed YAML. */
interface Yaml {
  lines: string[];
  newline: string;
  end: number;
  document: ReturnType<typeof parseDocument>;
  counter: LineCounter;
}

/**
 * yamlOf parses the front matter of a text, or returns undefined when the text has none.
 * @param text - The Markdown text.
 */
function yamlOf(text: string): Yaml | undefined {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (!opening.test(lines[0] ?? '')) {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > 0 && closing.test(line));
  if (end < 0) {
    return undefined;
  }
  const counter = new LineCounter();
  const document = parseDocument(lines.slice(1, end).join('\n'), { lineCounter: counter, prettyErrors: false, uniqueKeys: true });
  return { lines, newline, end, document, counter };
}

/**
 * textOf returns a value of the YAML as text: a scalar as its text, and a list or a map as its YAML on one line.
 * @param node - The value.
 */
function textOf(node: unknown): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (isScalar(node)) {
    return node.value === null || node.value === undefined ? '' : String(node.value);
  }
  return stringify(node, { collectionStyle: 'flow' }).trim();
}

/** isText tells whether a value is a scalar that a text line can show, or no value. */
const isText = (node: unknown): boolean => node === null || node === undefined || (isScalar(node) && typeof node.value !== 'object');

/**
 * formOf returns the form of the front matter of a text for its layout.
 * @param text - The Markdown text.
 * @param file - The name of the file.
 * @param layout - The layout of the file, or undefined when it cannot be read.
 * @param layoutProblem - The problem of the layout, when it cannot be read.
 */
export function formOf(text: string, file: string, layout: Layout | undefined, layoutProblem = ''): Form {
  const yaml = yamlOf(text);
  const problems: string[] = [];
  const nodes = new Map<string, unknown>();
  if (yaml) {
    problems.push(...yaml.document.errors.map((error) => `Line ${yaml.counter.linePos(error.pos[0]).line + 1} of the front matter: ${error.message.split('\n')[0]}`));
    if (isMap(yaml.document.contents)) {
      for (const pair of yaml.document.contents.items) {
        if (isScalar(pair.key)) {
          nodes.set(String(pair.key.value), pair.value);
        }
      }
    } else if (yaml.document.contents !== null && problems.length === 0) {
      problems.push('The front matter is no map of fields.');
    }
  }
  if (layoutProblem) {
    problems.push(layoutProblem);
  }
  const repos = nodes.get('repos');
  const fields: FieldRow[] = Object.entries(layout?.fields ?? {}).map(([key, spec]) => {
    const node = nodes.get(key);
    const value = textOf(node).trim();
    const empty = value === '';
    let warning = '';
    if (spec.required && empty && (spec.default ?? '').trim() === '') {
      warning = 'The layout needs this field.';
    } else if (spec.values && !empty && !spec.values.includes(value)) {
      warning = `The value is one of: ${spec.values.join(', ')}.`;
    }
    return { key, description: spec.description, required: spec.required, value, placeholder: spec.default ?? '', ...(spec.values ? { values: spec.values } : {}), readOnly: !isText(node), warning };
  });
  const known = new Set([...keysOfThePaper, ...fields.map((field) => field.key)]);
  return {
    file,
    layout: textOf(nodes.get('layout')).trim(),
    layoutName: layout?.name ?? '',
    repos: isMap(repos) ? repos.items.map((item) => ({ name: isScalar(item.key) ? String(item.key.value) : '', reference: textOf(item.value) })) : [],
    lang: textOf(nodes.get('lang')).trim(),
    language: layout?.language ?? '',
    fields,
    unknown: layout ? [...nodes].filter(([key]) => !known.has(key)).map(([key, node]) => ({ key, value: textOf(node) })) : [],
    problems,
  };
}

/**
 * pairLines returns the lines of the file that hold a key of the front matter and its value: the first and the last
 * line, counted from 0 in the file.
 * @param yaml - The front matter.
 * @param key - The key.
 */
function pairLines(yaml: Yaml, key: string): { first: number; last: number } | undefined {
  if (!isMap(yaml.document.contents)) {
    return undefined;
  }
  for (const pair of yaml.document.contents.items) {
    if (!isScalar(pair.key) || String(pair.key.value) !== key || !pair.key.range) {
      continue;
    }
    const value = pair.value as Node | null;
    const end = value?.range ? Math.max(value.range[0], value.range[1] - 1) : pair.key.range[1];
    // The YAML starts in the line after the first `---`, and linePos counts its lines from 1, so a line of linePos is
    // the line of the file counted from 0.
    return { first: yaml.counter.linePos(pair.key.range[0]).line, last: yaml.counter.linePos(end).line };
  }
  return undefined;
}

/**
 * lineOf returns the line `key: value` of a value of a text line, in the form that YAML reads back as the same text.
 * @param key - The key.
 * @param value - The value.
 */
function lineOf(key: string, value: string): string {
  return `${key}: ${stringify(value, { lineWidth: 0 }).trim()}`;
}

/**
 * applyChange returns the text with a change of the form: the value of a key replaces the lines of its key, a new key
 * goes in after the keys that come before it in the order of the layout, and '' removes the lines of the key. A text
 * without a front matter gets one. The other lines stay as they are.
 * @param text - The Markdown text.
 * @param change - The change.
 * @param order - The keys of the front matter in their order: `layout`, the fields of the layout, `lang`.
 */
export function applyChange(text: string, change: Change, order: readonly string[]): string {
  const yaml = yamlOf(text);
  if (!yaml) {
    if (change.value === '') {
      return text;
    }
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    return ['---', lineOf(change.key, change.value), '---', ''].join(newline) + text;
  }
  const lines = [...yaml.lines];
  const present = pairLines(yaml, change.key);
  if (present) {
    const replacement = change.value === '' ? [] : [lineOf(change.key, change.value)];
    lines.splice(present.first, present.last - present.first + 1, ...replacement);
    return lines.join(yaml.newline);
  }
  if (change.value === '') {
    return text;
  }
  // The new key goes after the last key of the file that comes before it in the order, else before the first key
  // that comes after it, else at the end of the front matter.
  const index = order.indexOf(change.key);
  let line = yaml.end;
  const before = order.slice(0, Math.max(index, 0)).map((key) => pairLines(yaml, key)).filter((found) => found !== undefined);
  const after = index < 0 ? [] : order.slice(index + 1).map((key) => pairLines(yaml, key)).filter((found) => found !== undefined);
  if (before.length > 0) {
    line = Math.max(...before.map((found) => found.last)) + 1;
  } else if (after.length > 0) {
    line = Math.min(...after.map((found) => found.first));
  }
  lines.splice(line, 0, lineOf(change.key, change.value));
  return lines.join(yaml.newline);
}

/**
 * orderOf returns the order of the keys of the front matter of a layout: `layout`, `repos`, the fields of the
 * layout, and `lang`.
 * @param layout - The layout.
 */
export const orderOf = (layout: Pick<Layout, 'fields'> | undefined): string[] => ['layout', 'repos', ...Object.keys(layout?.fields ?? {}), 'lang'];

/**
 * changedLines returns the lines that differ between two texts: the first line and the end line (exclusive) in the
 * old text, and the new lines, so that an edit of the editor replaces only them.
 * @param before - The old text.
 * @param after - The new text.
 */
export function changedLines(before: string, after: string): { start: number; end: number; lines: string[] } {
  const old = before.split(/\r?\n/);
  const next = after.split(/\r?\n/);
  let start = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) {
    start++;
  }
  let tail = 0;
  while (tail < old.length - start && tail < next.length - start && old[old.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail++;
  }
  return { start, end: old.length - tail, lines: next.slice(start, next.length - tail) };
}
