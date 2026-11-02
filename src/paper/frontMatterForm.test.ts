// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { describe, expect, test } from 'vitest';
import { readFrontMatter } from './frontMatter';
import { applyChange, changedLines, formOf, orderOf } from './frontMatterForm';
import type { Layout } from './layout';

/** layout is a layout with a required field, a parameter with a default, and a free field. */
const layout = {
  id: 'thesis',
  name: 'Thesis',
  language: 'de-AT',
  fields: {
    title: { description: 'The title.', required: true },
    type: { description: 'The kind of the work.', required: false, default: 'Bachelorarbeit', values: ['Bachelorarbeit', 'Masterarbeit'] },
    author: { description: 'The author.', required: false },
    date: { description: 'The date.', required: false },
  },
} as unknown as Layout;

const order = orderOf(layout);

describe('the form of the front matter (R-DOC-005)', () => {
  test('has one row for each field of the layout in its order, with the warnings of the checks', () => {
    const text = '---\nlayout: thesis\nrepos:\n  server: myorg/server@v2.1.0\nauthor: [Anna, Bernd]\ntype: Doktorarbeit\nlang: en-US\nsigned: true\n---\n\n# Text\n';
    const form = formOf(text, 'paper.md', layout);
    expect(form.fields.map((field) => field.key)).toEqual(['title', 'type', 'author', 'date']);
    expect(form.fields[0]).toMatchObject({ value: '', required: true, warning: 'The layout needs this field.' });
    expect(form.fields[1]).toMatchObject({ value: 'Doktorarbeit', placeholder: 'Bachelorarbeit', values: ['Bachelorarbeit', 'Masterarbeit'], warning: 'The value is one of: Bachelorarbeit, Masterarbeit.' });
    // A list is no text: the text editor changes it.
    expect(form.fields[2]).toMatchObject({ value: '[ Anna, Bernd ]', readOnly: true });
    expect(form).toMatchObject({ layout: 'thesis', layoutName: 'Thesis', repos: [{ name: 'server', reference: 'myorg/server@v2.1.0' }], lang: 'en-US', language: 'de-AT', unknown: [{ key: 'signed', value: 'true' }], problems: [] });
  });

  test('names a YAML error and the problem of the layout, and has no unknown keys without a layout', () => {
    const form = formOf('---\nlayout: org/repo/thesis@main\ntitle: [a\n---\n', 'paper.md', undefined, 'The layout is not in .markdownpaper/repos/ yet: run "mp get".');
    expect(form.problems).toHaveLength(2);
    expect(form.problems[0]).toMatch(/^Line 3 of the front matter: /);
    expect(form.problems[1]).toBe('The layout is not in .markdownpaper/repos/ yet: run "mp get".');
    expect(form.unknown).toEqual([]);
  });

  test('a change replaces the lines of its key and keeps every other line as it is', () => {
    const text = '---\nlayout: thesis   # the PHT layout\ntitle: |\n  Old\n  title\nauthor: "Anna"\n---\n\nBody\n';
    const changed = applyChange(text, { key: 'title', value: 'Agenten: im Team' }, order);
    expect(changed).toBe('---\nlayout: thesis   # the PHT layout\ntitle: "Agenten: im Team"\nauthor: "Anna"\n---\n\nBody\n');
    expect(readFrontMatter(changed)?.values.title).toBe('Agenten: im Team');
    // A value that YAML reads as a number or a boolean stays text.
    const year = applyChange(text, { key: 'author', value: '2026' }, order);
    expect(readFrontMatter(year)?.values.author).toBe('2026');
    expect(year).toContain('author: "2026"\n');
  });

  test('a new key goes in at its place in the order of the layout, and an empty value removes the key', () => {
    const text = '---\r\nlayout: thesis\r\ntitle: Agenten\r\ndate: 1. Juni 2026\r\n---\r\nBody\r\n';
    const added = applyChange(text, { key: 'author', value: 'Anna' }, order);
    expect(added).toBe('---\r\nlayout: thesis\r\ntitle: Agenten\r\nauthor: Anna\r\ndate: 1. Juni 2026\r\n---\r\nBody\r\n');
    const first = applyChange('---\nlayout: thesis\ndate: x\n---\n', { key: 'title', value: 'T' }, order);
    expect(first).toBe('---\nlayout: thesis\ntitle: T\ndate: x\n---\n');
    expect(applyChange('---\ntitle: T\n---\n', { key: 'layout', value: 'plain' }, order)).toBe('---\nlayout: plain\ntitle: T\n---\n');
    expect(applyChange('---\nlayout: thesis\n---\n', { key: 'lang', value: 'en-US' }, order)).toBe('---\nlayout: thesis\nlang: en-US\n---\n');
    expect(applyChange(added, { key: 'title', value: '' }, order)).toBe('---\r\nlayout: thesis\r\nauthor: Anna\r\ndate: 1. Juni 2026\r\n---\r\nBody\r\n');
    // An unknown key with a value on more lines goes as a whole.
    expect(applyChange('---\nlayout: thesis\nold:\n  - a\n  - b\ntitle: T\n---\n', { key: 'old', value: '' }, order)).toBe('---\nlayout: thesis\ntitle: T\n---\n');
  });

  test('a text without a front matter gets one, and the lines of an edit are only the changed lines', () => {
    expect(applyChange('# Text\n', { key: 'title', value: 'T' }, order)).toBe('---\ntitle: T\n---\n# Text\n');
    expect(applyChange('# Text\n', { key: 'title', value: '' }, order)).toBe('# Text\n');
    expect(changedLines('a\nb\nc\nd\n', 'a\nB\nX\nc\nd\n')).toEqual({ start: 1, end: 2, lines: ['B', 'X'] });
    expect(changedLines('a\nb\nc\n', 'a\nc\n')).toEqual({ start: 1, end: 2, lines: [] });
  });
});
