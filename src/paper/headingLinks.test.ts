// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { describe, expect, test } from 'vitest';
import { writeHeadingLinks } from './headingLinks';
import { type Layout, termsFor } from './layout';

/** layout is a German layout that numbers the headings to the depth 3. */
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

describe('the numbers of the headings in the links to them (R-REN-009)', () => {
  test('the format step writes the word of a link and the number of its heading by the rules of the layout', () => {
    const paper = [
      '---',
      'title: "[Kapitel 9](#methoden)"',
      '---',
      '# Einleitung',
      '',
      '[Kapitel 7](#methoden) und [Abschnitt 1](#erklärung "Titel") zeigen es, [die Methoden](#methoden) auch.',
      '',
      '## Methoden',
      '',
      '## Erklärung',
      '',
      '### Tiefer <a id="sec-tiefer"></a>',
      '',
      'Siehe [Kap. 3](#sec-tiefer), `[Kapitel 9](#methoden)`, ![Kapitel 9](#methoden) und [Kapitel 9](#fehlt).',
      '',
      '<!-- [Kapitel 9](#methoden)',
      '[Kapitel 9](#methoden) -->',
      '',
      '```markdown',
      '[Kapitel 9](#methoden)',
      '```',
      '',
      '# Literaturverzeichnis',
      '',
      'Das [Kapitel 4](#literaturverzeichnis) hat keine Nummer.',
      '',
      '# Anhang',
      '',
      '## Leitfaden',
      '',
      '## Daten',
      '',
      'Siehe [Anhang C](#daten).',
    ];
    const written = writeHeadingLinks(paper, layout);
    expect(written[1]).toBe('title: "[Kapitel 9](#methoden)"');
    expect(written[5]).toBe('[Kapitel 1.1](#methoden) und [Abschnitt 1.2](#erklärung "Titel") zeigen es, [die Methoden](#methoden) auch.');
    expect(written[13]).toBe('Siehe [Kap. 1.2.1](#sec-tiefer), `[Kapitel 9](#methoden)`, ![Kapitel 9](#methoden) und [Kapitel 9](#fehlt).');
    expect(written.slice(14, 21)).toEqual(paper.slice(14, 21));
    expect(written[24]).toBe('Das [Kapitel 4](#literaturverzeichnis) hat keine Nummer.');
    expect(written[32]).toBe('Siehe [Anhang B](#daten).');
    expect(writeHeadingLinks(written, layout)).toEqual(written);
  });
});
