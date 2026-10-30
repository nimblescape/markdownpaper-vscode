// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { describe, expect, test } from 'vitest';
import { type Layout, termsFor } from './layout';
import { writeLists } from './lists';
import { renderBody } from './markdown';

/** layout is a German layout that numbers the headings to the depth 2. */
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
  contentsDepth: 2,
  hyphenate: false,
  listings: { lineNumbers: false },
  pdfName: '{{file}}',
  terms: termsFor('de-AT'),
};

/** paper is a document with the four lists, an appendix and a caption of each kind. */
const paper = [
  '---',
  'layout: test',
  '---',
  '# Inhaltsverzeichnis',
  '',
  '# Abbildungsverzeichnis',
  'Ein Satz, der nicht zählt.',
  '',
  '# Tabellenverzeichnis',
  '',
  '<!-- lot -->',
  '- [Tabelle 9: Alt](#alt)',
  '<!-- /lot -->',
  '',
  '# Listingverzeichnis',
  '',
  '# Einleitung',
  '',
  '## Methoden *und* Daten',
  '',
  '### Tiefer',
  '',
  'Figure 1: Die [Rollen] <a id="fig-rollen"></a>',
  '',
  '![Rollen](rollen.png)',
  '',
  'Table 1: Noten <a id="tab-noten"></a>',
  '',
  '| a |',
  '| - |',
  '| 1 |',
  '',
  'Listing 1: [Lesen](../src/a.ts#L1-L3) <a id="lst-lesen"></a>',
  '',
  '```ts',
  'a();',
  '```',
  '',
  '# Literaturverzeichnis',
  '',
  '# Anhang',
  '',
  '## Leitfaden',
  '',
  '## Daten',
  '',
];

describe('the lists of the special sections in the file (R-REN-004, R-GEN-008)', () => {
  test('the format step writes the four lists between their markers, with the numbers of the pages', () => {
    const written = writeLists(paper, layout);
    expect(written.slice(3, 45).join('\n')).toBe(
      [
        '# Inhaltsverzeichnis',
        '',
        '<!-- toc -->',
        '- [Abbildungsverzeichnis](#abbildungsverzeichnis)',
        '- [Tabellenverzeichnis](#tabellenverzeichnis)',
        '- [Listingverzeichnis](#listingverzeichnis)',
        '- [1 Einleitung](#einleitung)',
        '- [1.1 Methoden und Daten](#methoden-und-daten)',
        '- [Literaturverzeichnis](#literaturverzeichnis)',
        '- [Anhang](#anhang)',
        '- [Anhang A: Leitfaden](#leitfaden)',
        '- [Anhang B: Daten](#daten)',
        '<!-- /toc -->',
        '',
        '# Abbildungsverzeichnis',
        '',
        '<!-- lof -->',
        '- [Abbildung 1: Die \\[Rollen\\]](#fig-rollen)',
        '<!-- /lof -->',
        '',
        'Ein Satz, der nicht zählt.',
        '',
        '# Tabellenverzeichnis',
        '',
        '<!-- lot -->',
        '- [Tabelle 1: Noten](#tab-noten)',
        '<!-- /lot -->',
        '',
        '# Listingverzeichnis',
        '',
        '<!-- lol -->',
        '- [Listing 1: Lesen](#lst-lesen)',
        '<!-- /lol -->',
        '',
        '# Einleitung',
        '',
        '## Methoden *und* Daten',
        '',
        '### Tiefer',
        '',
        'Figure 1: Die [Rollen] <a id="fig-rollen"></a>',
        '',
      ].join('\n'),
    );
    // The format is stable, and the pages show the lists of the file without a problem.
    expect(writeLists(written, layout)).toEqual(written);
    const body = renderBody(written.join('\n').replace(/^---\n[\s\S]*?\n---\n/, '\n\n\n'), layout);
    expect(body.problems).toEqual([]);
    expect(body.html).toContain('<li class="contents-level-2"><a href="#methoden-und-daten"><span class="contents-number">1.1</span><span class="contents-text">Methoden und Daten</span></a></li>');
    expect(body.html).toContain('<span class="caption-label">Abbildung 1</span><span class="caption-separator">: </span><span class="caption-text">Die [Rollen]</span>');
  });

  test('a file without a special section with a list keeps its lines', () => {
    const lines = ['# Einleitung', '', 'Text', ''];
    expect(writeLists(lines, layout)).toEqual(lines);
  });

  test('a list at the end of the file gets its markers after the heading', () => {
    expect(writeLists(['# Inhaltsverzeichnis'], layout)).toEqual(['# Inhaltsverzeichnis', '', '<!-- toc -->', '<!-- /toc -->']);
  });
});
