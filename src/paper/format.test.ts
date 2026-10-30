// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the order of the steps of the paper (R-CLI-002): the citations and the reference list first, then
 * the lists, so that one format gives a stable file whose table of contents lists the new reference list.
 */

import { expect, test } from 'vitest';
import { builtinStyles } from './csl';
import { formatPaper } from './format';
import { type Layout, termsFor } from './layout';

const layout: Layout = {
  id: 'test',
  folder: 'file:///layouts/test/',
  name: 'Test',
  language: 'de-AT',
  stylesheets: [],
  before: [],
  after: [],
  fields: {},
  numbered: true,
  depth: 3,
  unnumbered: [],
  numberedSections: [],
  contentsDepth: 2,
  contentsFront: true,
  hyphenate: false,
  references: { hyphenate: false },
  listings: { lineNumbers: false },
  pdfName: '{{file}}',
  terms: termsFor('de-AT'),
};

test('one format writes the citations, a new reference list and a table of contents that lists it, and a second format changes nothing (R-CLI-002)', () => {
  const lines = [
    '---',
    'layout: test',
    '---',
    '# Inhaltsverzeichnis',
    '',
    '# Einleitung',
    '',
    'Text ([x](#raggl2015 "page 3")).',
    '',
    '<!-- nimblescape-sources',
    '{"id":"raggl2015","type":"book","author":[{"family":"Raggl","given":"Andrea"}],"issued":{"date-parts":[[2015]]},"title":"Schule"}',
    '-->',
  ];
  const formatted = formatPaper(lines, layout, { name: 'apa7', xml: builtinStyles.apa7 });
  expect(formatted.slice(3, 17)).toEqual([
    '# Inhaltsverzeichnis',
    '',
    '<!-- toc -->',
    '- [1 Einleitung](#einleitung)',
    '- [Literaturverzeichnis](#literaturverzeichnis)',
    '<!-- /toc -->',
    '',
    '# Einleitung',
    '',
    'Text ([Raggl, 2015, S. 3](#raggl2015 "page 3")).',
    '',
    '# Literaturverzeichnis',
    '',
    '<a id="raggl2015"></a>Raggl, A. (2015). *Schule*.',
  ]);
  expect(formatPaper(formatted, layout, { name: 'apa7', xml: builtinStyles.apa7 })).toEqual(formatted);
});

test('a citation style that citeproc-js cannot apply leaves the citations as they are and still writes the lists (R-CLI-002)', () => {
  const lines = ['# Inhaltsverzeichnis', '', 'Text ([x](#a)).', '', '<!-- nimblescape-sources', '{"id":"a","title":"A"}', '-->'];
  const formatted = formatPaper(lines, layout, { name: 'bad.csl', xml: '<style xmlns="http://purl.org/net/xbiblio/csl"></style>' });
  expect(formatted).toContain('Text ([x](#a)).');
  expect(formatted).toContain('<!-- toc -->');
});
