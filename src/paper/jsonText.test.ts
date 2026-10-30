// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the changes of a JSON text that keep its form ([R-LAY-010](../../docs/requirements.md#r-lay-010)).
 */

import { describe, expect, test } from 'vitest';
import { editJsonText, sameJson } from './jsonText';

const text = `{
  "$schema": "https://example.org/layout.schema.json",
  "name": "Thesis",
  "stylesheets": ["page.css", "cover.css"],
  "fields": {
    "kapitelumbruch": { "values": ["ja", "nein"], "default": "ja" }
  },
  "hyphenate": true
}
`;

describe('the changes of a JSON text that keep its form (R-LAY-010)', () => {
  test('a field with the same value keeps its text, a changed field gets its new value in its place', () => {
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(editJsonText(text, json)).toBe(text);
    const edited = editJsonText(text, { ...json, name: 'Mine', hyphenate: false });
    expect(edited).toBe(text.replace('"Thesis"', '"Mine"').replace('"hyphenate": true', '"hyphenate": false'));
  });

  test('a new field comes at the end with the indent of the text, and a field that the object has no longer goes', () => {
    const json = JSON.parse(text) as Record<string, unknown>;
    delete json.hyphenate;
    const edited = editJsonText(text, { ...json, origin: { layout: 'github:owner/layouts/thesis', ref: 'main' } });
    expect(edited).toBe(text.replace('"hyphenate": true', '"origin": {\n    "layout": "github:owner/layouts/thesis",\n    "ref": "main"\n  }'));
    expect(JSON.parse(edited)).toEqual({ ...json, origin: { layout: 'github:owner/layouts/thesis', ref: 'main' } });
  });

  test('strings with quotes, brackets and braces do not end a value early', () => {
    const tricky = '{\n    "a": "x \\" ] } , y",\n    "b": [1, {"c": "]"}],\n    "d": null\n}';
    expect(editJsonText(tricky, { a: 'x " ] } , y', b: [1, { c: ']' }], d: 2 })).toBe(tricky.replace('null', '2'));
  });

  test('a text that is no object of JSON gives the fields with an indent of two spaces', () => {
    expect(editJsonText('[1]', { a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
    expect(editJsonText('{}', { a: 1 })).toBe('{\n  "a": 1\n}\n');
  });

  test('two values are the same with the keys of their objects in any order', () => {
    expect(sameJson({ a: 1, b: [{ c: 1, d: 2 }] }, { b: [{ d: 2, c: 1 }], a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });
});
