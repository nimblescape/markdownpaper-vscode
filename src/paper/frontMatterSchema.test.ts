// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the JSON schema of the front matter of a paper (src/paper/frontMatterSchema.ts, R-EDIT-001).

import { expect, test } from 'vitest';
import { frontMatterSchemaOf } from './frontMatterSchema';

test('the schema of a layout: layout, the fields with their descriptions, defaults and values, and lang, in the order of the view "Front Matter"', () => {
  const schema = frontMatterSchemaOf({
    name: 'Thesis',
    language: 'de-AT',
    fields: { title: { description: 'Der Titel.', required: true }, font: { description: 'Die Schrift.', required: false, default: 'arial', values: ['arial', 'times'] }, note: { description: '', required: false } },
  });
  expect(schema).toEqual({
    type: 'object',
    properties: {
      layout: { type: 'string', title: 'Layout', description: 'The layout of the document: Thesis. The command mp create writes it.', readOnly: true },
      title: { type: 'string', description: 'Der Titel.' },
      font: { type: 'string', description: 'Die Schrift.', default: 'arial', enum: ['arial', 'times'] },
      note: { type: 'string' },
      lang: { type: 'string', description: 'The language of the document, a tag such as de-AT or en-US. Without it, the document has the language of the layout, de-AT.', default: 'de-AT' },
    },
    required: ['layout', 'title'],
  });
  expect(Object.keys(schema.properties as object)).toEqual(['layout', 'title', 'font', 'note', 'lang']);
});

test('a field lang of the layout stays as the layout defines it', () => {
  const schema = frontMatterSchemaOf({ name: 'Plain', language: 'en-US', fields: { lang: { description: 'The language.', required: false } } });
  expect((schema.properties as Record<string, unknown>).lang).toEqual({ type: 'string', description: 'The language.' });
});
