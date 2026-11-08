// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the parts of a paper document in the clean editing view of Markdown Notes (R-GEN-003, decision 71):
 * the hidden database, the hidden anchors of the entries and markers of the lists, and the citations, the entries and
 * the lists that the view keeps read-only.
 */

import { describe, expect, test } from 'vitest';
import { generatedParts, hiddenDatabase, hiddenMarkers } from './parts';

/** paper is a paper document with a list, a citation, the reference list, the database and a footnote after it. */
const paper = [
  '---',
  'layout: plain',
  'title: A paper',
  '---',
  '',
  '# Inhaltsverzeichnis',
  '',
  '<!-- toc -->',
  '- [1 Einleitung](#einleitung)',
  '<!-- /toc -->',
  '',
  '# Einleitung',
  '',
  'Agents change work ([Hong et al., 2024, S. 3](#hong2024 "page 3")), not `[(Hong, 2024)](#hong2024)`.',
  '',
  '# Literatur',
  '',
  '<a id="hong2024"></a>Hong, S. (2024). MetaGPT.',
  'The second line of the entry.',
  '',
  '<a id="other"></a>No source of the database.',
  '',
  '<!-- nimblescape-sources',
  '{"id":"hong2024","type":"article-journal","title":"MetaGPT"}',
  '-->',
  '',
  '[^1]: A footnote after the database.',
];

/** texts returns the text of each part, a block as its lines. */
const texts = (lines: readonly string[], parts: readonly ({ line: number; start: number; end: number } | { first: number; last: number })[]): string[] =>
  parts.map((part) => ('first' in part ? lines.slice(part.first, part.last + 1).join('\n') : lines[part.line].slice(part.start, part.end)));

describe('hiddenDatabase', () => {
  test('hides the database wherever it stands, also before a footnote', () => {
    expect(hiddenDatabase(paper)).toEqual([{ first: 22, last: 24 }]);
  });

  test('leaves a database without its end in the view, so that its check shows', () => {
    expect(hiddenDatabase(paper.slice(0, 24))).toEqual([]);
  });
});

describe('hiddenMarkers', () => {
  test('hides the markers of the lists and the anchor of each entry of a source', () => {
    expect(texts(paper, hiddenMarkers(paper))).toEqual(['<!-- toc -->', '<!-- /toc -->', '<a id="hong2024"></a>']);
  });

  test('leaves the marker <!-- toc --> of another Markdown file, which another tool writes', () => {
    expect(hiddenMarkers(['# Readme', '', '<!-- toc -->', '- [Readme](#readme)', '<!-- /toc -->'])).toEqual([]);
  });
});

describe('generatedParts', () => {
  test('finds the text of each citation, each entry of a source and each list with its markers', () => {
    expect(texts(paper, generatedParts(paper))).toEqual([
      'Hong et al., 2024, S. 3',
      '<a id="hong2024"></a>Hong, S. (2024). MetaGPT.\nThe second line of the entry.',
      '<!-- toc -->\n- [1 Einleitung](#einleitung)\n<!-- /toc -->',
    ]);
  });

  test('finds nothing in a file without a database and without lists', () => {
    expect(generatedParts(['# A text', '', 'See [Hong](#hong2024).'])).toEqual([]);
  });
});

describe('the links to headings', () => {
  /** linked is a paper document with links to its headings and other links. */
  const linked = [
    '---',
    'layout: plain',
    '---',
    '',
    '# Einleitung',
    '',
    'See [Kapitel 1](#einleitung), [Anhang B](#daten), [Abschnitt 2.1](#methoden-1) and [Teil 3](#teil "a title").',
    'Not [the intro](#einleitung), [Kapitel 9](#nirgends), `[Kapitel 1](#einleitung)` or <!-- [Kapitel 1](#einleitung) -->.',
    '',
    '## *Methoden*',
    '',
    '## Methoden',
    '',
    'Teil',
    '====',
    '',
    '# <wbr><!--{appendix}-->Daten<!--{/appendix}--> <a id="anhang-daten"></a>',
    '',
    'And [Anhang B](#anhang-daten).',
  ];

  test('are read-only in a paper document: the text of a link whose text is a word and a number or a label, to a heading of the file (R-REN-009)', () => {
    expect(texts(linked, generatedParts(linked))).toEqual(['Kapitel 1', 'Anhang B', 'Abschnitt 2.1', 'Teil 3', 'Anhang B']);
  });

  test('count only in a paper document', () => {
    const plain = linked.slice(4);
    expect(generatedParts(plain)).toEqual([]);
  });
});
