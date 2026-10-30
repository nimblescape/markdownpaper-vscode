// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Changes of the text of a JSON object that keep its form, for the `layout.json` of a copy of a layout
 * ([R-LAY-010](../../docs/requirements.md#r-lay-010)). A field whose value stays keeps its text, such as an array on
 * one line, so that the copy differs from the file of its repository only in the fields that differ. The module uses
 * no API of VS Code.
 */

/** Json is an object of JSON. */
export type Json = Record<string, unknown>;

/**
 * sameJson tells whether two values of JSON are equal, with the keys of their objects in any order.
 * @param a - The first value.
 * @param b - The second value.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(sorted) : typeof value === 'object' && value !== null ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Json)[key])])) : value;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

/** Member is a field of the object of a JSON text: its key, its value, and where its text starts and ends. */
interface Member {
  key: string;
  value: unknown;
  start: number;
  end: number;
}

/**
 * members reads the fields of the object of a JSON text with their places, or returns undefined for a text that is
 * no object of JSON.
 * @param text - The text.
 */
function members(text: string): { open: number; close: number; list: Member[] } | undefined {
  let at = 0;
  const space = (): void => {
    while (/\s/.test(text[at] ?? '')) {
      at++;
    }
  };
  // skipValue moves over one value: a string, an object or an array with the strings in it, or a word or a number.
  const skipValue = (): void => {
    let depth = 0;
    do {
      const char = text[at];
      if (char === '"') {
        at++;
        while (at < text.length && text[at] !== '"') {
          at += text[at] === '\\' ? 2 : 1;
        }
        at++;
      } else if (char === '{' || char === '[') {
        depth++;
        at++;
      } else if (char === '}' || char === ']') {
        depth--;
        at++;
      } else if (depth > 0) {
        at++;
      } else {
        while (at < text.length && !/[\s,}\]]/.test(text[at])) {
          at++;
        }
      }
    } while (depth > 0 && at < text.length);
  };
  try {
    space();
    if (text[at] !== '{') {
      return undefined;
    }
    const open = at++;
    const list: Member[] = [];
    space();
    while (text[at] === '"') {
      const start = at;
      skipValue();
      const key = JSON.parse(text.slice(start, at)) as string;
      space();
      if (text[at++] !== ':') {
        return undefined;
      }
      space();
      const from = at;
      skipValue();
      list.push({ key, value: JSON.parse(text.slice(from, at)), start, end: at });
      space();
      if (text[at] !== ',') {
        break;
      }
      at++;
      space();
    }
    return text[at] === '}' ? { open, close: at, list } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * editJsonText returns the text of a JSON object with the fields of `json` and their values, in the form of `text`: a
 * field of the text with the same value keeps its text and its place, a field with another value gets the new value
 * in its place, a field that `json` does not have goes, and a new field comes at the end, in the order of `json`. A
 * new value has the indent of the text, two spaces by default. A text that is no object of JSON gives the fields
 * with an indent of two spaces.
 * @param text - The text of the object whose form the new text keeps.
 * @param json - The fields of the new text.
 */
export function editJsonText(text: string, json: Json): string {
  const read = members(text);
  if (!read || read.list.length === 0) {
    return `${JSON.stringify(json, null, 2)}\n`;
  }
  const { list } = read;
  const line = text.lastIndexOf('\n', list[0].start - 1);
  const indent = line < read.open ? '  ' : text.slice(line + 1, list[0].start);
  const separator = list.length > 1 ? text.slice(list[0].end, list[1].start) : `,\n${indent}`;
  const field = (key: string, value: unknown): string => `${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, `\n${indent}`)}`;
  const parts: string[] = [];
  for (const member of list) {
    if (!(member.key in json) || json[member.key] === undefined) {
      continue;
    }
    parts.push(sameJson(member.value, json[member.key]) ? text.slice(member.start, member.end) : field(member.key, json[member.key]));
  }
  const known = new Set(list.map((member) => member.key));
  for (const [key, value] of Object.entries(json)) {
    if (!known.has(key) && value !== undefined) {
      parts.push(field(key, value));
    }
  }
  return `${text.slice(0, list[0].start)}${parts.join(separator)}${text.slice(list[list.length - 1].end)}`;
}
