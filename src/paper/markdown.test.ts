// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { describe, expect, test } from 'vitest';
import { hyphenatorOf, softHyphen } from './hyphenate';
import { type Layout, termsFor } from './layout';
import { renderBody } from './markdown';

/**
 * layoutOf returns a layout for the tests.
 * @param changes - The fields that differ from the defaults.
 */
const layoutOf = (changes: Partial<Layout> = {}): Layout => ({
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
  contentsDepth: 3,
  hyphenate: false,
  pdfName: '{{file}}',
  terms: termsFor('de-AT'),
  ...changes,
});

/** example is the example of docs/format.md of nimblescape Markdown Notes, version 1.0.0, with a footnote of its own. */
const example = `<!-- nimblescape-markdown-notes v1.0.0 spec=https://github.com/nimblescape/nimblescape-markdown-notes/blob/main/docs/format.md
This comment marks a Markdown file with notes of the VS Code extension nimblescape Markdown Notes.
-->

# Title

The agents <wbr><!--[note-7k2q green-->change the work of teams[^note-7k2q] in three ways.[^ways]

[^note-7k2q]: **hannes** · 2026-10-28 10:15+01:00

    Which three ways?

    > **anna** · 2026-10-28 11:02+01:00
    >
    > The ways of the plan.

[^ways]: Planning, writing and checking.

The next paragraph.
`;

describe('notes of nimblescape Markdown Notes (R-REN-002)', () => {
  test('the pages leave out the start markers, the references and the definitions of the notes, and keep the paragraph', () => {
    const body = renderBody(example, layoutOf());
    expect(body.notes).toBe(1);
    expect(body.html).not.toContain('note-7k2q');
    expect(body.html).not.toContain('Which three ways');
    expect(body.html).not.toContain('<wbr>');
    expect(body.html).toContain('The agents change the work of teams in three ways.');
    expect(body.html).toContain('<p data-line="18">The next paragraph.</p>');
  });

  test('a footnote of the document goes to the place of its reference, numbered without the notes', () => {
    const body = renderBody(example, layoutOf());
    expect(body.footnotes).toBe(1);
    expect(body.html).toContain('three ways.<span class="footnote"><span class="footnote-paragraph">Planning, writing and checking.</span></span>');
    expect(body.html).not.toContain('footnotes-sep');
  });

  test('a second reference of a footnote shows its number', () => {
    const body = renderBody('A[^a] B[^b] C[^a]\n\n[^a]: One.\n\n[^b]: Two.\n', layoutOf());
    expect(body.footnotes).toBe(2);
    expect(body.html).toContain('<sup class="footnote-again">1</sup>');
  });

  test('a reference of a note in a code span stays as it is', () => {
    expect(renderBody('Write `[^note-7k2q]` for a note.\n', layoutOf()).html).toContain('<code>[^note-7k2q]</code>');
  });
});

describe('headings (R-REN-003)', () => {
  test('the headings get numbers to the depth of the layout, and IDs from their text', () => {
    const html = renderBody('# Einleitung\n\n## Frage\n\n### Methode\n\n#### Detail\n\n# Ergebnis\n', layoutOf()).html;
    expect(html).toContain('<h1 data-line="0" id="einleitung"><span class="heading-number">1</span> Einleitung</h1>');
    expect(html).toContain('<span class="heading-number">1.1</span> Frage');
    expect(html).toContain('<span class="heading-number">1.1.1</span> Methode');
    expect(html).toContain('<h4 data-line="6" id="detail" class="unnumbered">Detail</h4>');
    expect(html).toContain('<span class="heading-number">2</span> Ergebnis');
  });

  test('a heading with {-} and the headings below it get no number, and the marker does not show', () => {
    const html = renderBody('# Begriffe {-}\n\n## Glossar\n\n# Einleitung\n', layoutOf()).html;
    expect(html).toContain('<h1 data-line="0" id="begriffe" class="unnumbered">Begriffe</h1>');
    expect(html).toContain('<h2 data-line="2" id="glossar" class="unnumbered">Glossar</h2>');
    expect(html).toContain('<span class="heading-number">1</span> Einleitung');
  });

  test('a document numbered by hand keeps its numbers, and a layout without numbers gets none', () => {
    expect(renderBody('# 1 Einleitung\n\n# 2 Ergebnis\n', layoutOf()).html).not.toContain('heading-number');
    expect(renderBody('# Einleitung\n', layoutOf({ numbered: false })).html).not.toContain('heading-number');
  });

  test('a pattern of the layout keeps a heading without a number', () => {
    expect(renderBody('# Glossar\n\n# Einleitung\n', layoutOf({ unnumbered: ['^glossar$'] })).html).toContain('<h1 data-line="0" id="glossar" class="unnumbered">Glossar</h1>');
  });

  test('two headings with the same text get two IDs', () => {
    const body = renderBody('# Teil\n\n# Teil\n', layoutOf());
    expect(body.headings.map((heading) => heading.id)).toEqual(['teil', 'teil-2']);
  });
});

describe('special sections (R-REN-004)', () => {
  test('the special sections of the language get no number and their code, also by a marker of their code', () => {
    const markdown = ['# Eidesstattliche Erklärung', '# Abstract', '# Danksagung', '# Vorwort', '# Inhaltsverzeichnis', '# Einleitung', '# Quellen und Materialien {BIB}', '# Anhang', '## Leitfaden', ''].join('\n\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.headings.map((heading) => [heading.text, heading.number, heading.section])).toEqual([
      ['Eidesstattliche Erklärung', '', 'ADT'],
      ['Abstract', '', 'AST'],
      ['Danksagung', '', 'ACC'],
      ['Vorwort', '', 'FWD'],
      ['Inhaltsverzeichnis', '', 'TOC'],
      ['Einleitung', '1', undefined],
      ['Quellen und Materialien', '', 'BIB'],
      ['Anhang', '', 'APX'],
      ['Leitfaden', 'Anhang', 'APX-A'],
    ]);
    expect(body.html).toContain('class="section-bib unnumbered" data-section="BIB">Quellen und Materialien</h1>');
  });

  test('English words count in an English layout', () => {
    const body = renderBody('# Table of Contents\n\n# Introduction\n\n# References\n', layoutOf({ language: 'en-US', terms: termsFor('en-US') }));
    expect(body.headings.map((heading) => heading.section)).toEqual(['TOC', undefined, 'BIB']);
  });

  test('the table of contents lists every heading but its own, with the numbers and the links to the pages', () => {
    const html = renderBody('# Abstract\n\n# Inhaltsverzeichnis\n\nOld text.\n\n# Einleitung\n\n## Frage\n', layoutOf()).html;
    expect(html).not.toContain('Old text');
    expect(html).toContain('<nav class="contents no-hyphens"><ol>');
    expect(html).toContain('<li class="contents-level-1 unnumbered"><a href="#abstract"><span class="contents-text">Abstract</span></a></li>');
    expect(html).not.toContain('href="#inhaltsverzeichnis"');
    expect(html).toContain('<li class="contents-level-2"><a href="#frage"><span class="contents-number">1.1</span><span class="contents-text">Frage</span></a></li>');
  });

  test('the reference list gets no soft hyphens', () => {
    const hyphenate = hyphenatorOf('de-AT');
    const html = renderBody('# Einleitung\n\nWirtschaftspädagogik\n\n# Literaturverzeichnis\n\nWirtschaftspädagogik\n', layoutOf({ hyphenate: true }), hyphenate).html;
    const [text, references] = html.split('<section class="references no-hyphens">');
    expect(text).toContain(softHyphen);
    expect(references).not.toContain(softHyphen);
  });
});

describe('figures and tables (R-REN-005)', () => {
  test('an image alone in its paragraph is a figure with its text as the numbered caption, listed in the list of figures', () => {
    const body = renderBody('# Abbildungsverzeichnis\n\n# Teil\n\n![Die Rollen](rollen.png)\n\nText ![Icon](icon.png) im Satz.\n\n![](logo.png)\n', layoutOf());
    expect(body.figures).toEqual([{ id: 'figure-1', label: 'Abbildung 1', text: 'Die Rollen', line: 4 }]);
    expect(body.html).toContain('<figure data-line="4" class="figure" id="figure-1"><img src="rollen.png" alt="Die Rollen"><figcaption><span class="caption-label">Abbildung 1</span><span class="caption-separator">: </span><span class="caption-text">Die Rollen</span></figcaption></figure>');
    expect(body.html).toContain('<p data-line="6">Text <img src="icon.png" alt="Icon"> im Satz.</p>');
    expect(body.html).toContain('<figure data-line="8" class="figure"><img src="logo.png" alt=""></figure>');
    expect(body.html).toContain('<nav class="list-of-figures no-hyphens"><ol>\n<li><a href="#figure-1"><span class="caption-entry"><span class="caption-label">Abbildung 1</span>');
  });

  test('a paragraph "Table:" directly before a table is its numbered caption, listed in the list of tables', () => {
    const markdown = '# Tabellenverzeichnis\n\n# Teil\n\nTable: Teilnehmende\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTabelle 7: Zweite\n\n| c |\n| - |\n| 3 |\n\nTable: no table follows\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.tables.map((table) => [table.label, table.text])).toEqual([
      ['Tabelle 1', 'Teilnehmende'],
      ['Tabelle 2', 'Zweite'],
    ]);
    expect(body.html).toContain('<p data-line="4" id="table-1" class="caption table-caption"><span class="caption-label">Tabelle 1</span><span class="caption-separator">: </span><span class="caption-text">Teilnehmende</span></p>');
    expect(body.html).toContain('<p data-line="16">Table: no table follows</p>');
    expect(body.html).toContain('<nav class="list-of-tables no-hyphens">');
  });

  test('the appendices are A, B, and their figures and tables are numbered A1, B1 (R-REN-006)', () => {
    const markdown = '# Teil\n\n![Eins](1.png)\n\n# Anhang\n\n## Leitfaden\n\n![Zwei](2.png)\n\n## Transkript\n\nTable: Kodes\n\n| a |\n| - |\n| 1 |\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.figures.map((figure) => figure.label)).toEqual(['Abbildung 1', 'Abbildung A1']);
    expect(body.tables.map((table) => table.label)).toEqual(['Tabelle B1']);
    expect(body.headings.filter((heading) => heading.appendix).map((heading) => heading.number)).toEqual(['Anhang A', 'Anhang B']);
    expect(body.html).toContain('<h2 data-line="6" id="leitfaden" class="appendix" data-section="APX-A"><span class="appendix-label">Anhang A</span> Leitfaden</h2>');
  });
});

describe('links to figures and tables (R-REN-009)', () => {
  test('the anchor of /figure and /table names the figure or the table, and a link to it gets its label', () => {
    const markdown = [
      'Siehe [Table 1](#tab-noten), [Figure 2](#fig-plan) und [den Plan](#fig-plan).',
      '',
      '![Der Plan](plan.png) <a id="fig-plan"></a>',
      '',
      'Table: Noten <a id="tab-noten"></a>',
      '',
      '| a |',
      '| - |',
      '| 1 |',
      '',
      '# Anhang',
      '',
      '## Daten',
      '',
      'Table: Rohdaten',
      '<a id="tab-roh"></a>',
      '',
      '| b |',
      '| - |',
      '| 2 |',
      '',
      'Wie [Tabelle 9](#tab-roh) zeigt; [Table 3](#tab-fehlt).',
      '',
    ].join('\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.figures).toEqual([{ id: 'fig-plan', label: 'Abbildung 1', text: 'Der Plan', line: 2 }]);
    expect(body.tables.map((table) => [table.id, table.label, table.text])).toEqual([
      ['tab-noten', 'Tabelle 1', 'Noten'],
      ['tab-roh', 'Tabelle A1', 'Rohdaten'],
    ]);
    expect(body.html).toContain('<a href="#tab-noten">Tabelle 1</a>, <a href="#fig-plan">Abbildung 1</a> und <a href="#fig-plan">den Plan</a>');
    expect(body.html).toContain('<figure data-line="2" class="figure" id="fig-plan"><img src="plan.png" alt="Der Plan"><figcaption>');
    expect(body.html).toContain('<p data-line="4" id="tab-noten" class="caption table-caption"><span class="caption-label">Tabelle 1</span><span class="caption-separator">: </span><span class="caption-text">Noten</span></p>');
    expect(body.html).toContain('<span class="caption-text">Rohdaten</span></p>');
    expect(body.html).toContain('Wie <a href="#tab-roh">Tabelle A1</a> zeigt; <a href="#tab-fehlt">Table 3</a>.');
    expect(body.html).not.toContain('<a id=');
    expect(body.problems).toEqual([{ severity: 'warning', message: 'The link #tab-fehlt names no figure, table or heading of the file.', line: 21 }]);
  });

  test('the anchor of /ref at the end of a heading is its ID, and a link to it gets the number of the heading or the label of the appendix', () => {
    const markdown = [
      '# Inhaltsverzeichnis',
      '',
      '# Einleitung',
      '',
      '## Methoden<a id="sec-methods"></a>',
      '',
      'Siehe [Kapitel 1.4](#sec-methods), [Chapter 9](#sec-methods), [die Methoden](#sec-methods), [Anhang C](#sec-guide) und [Kapitel 3](#sec-toc).',
      '',
      '# Literaturverzeichnis {BIB} <a id="sec-toc"></a>',
      '',
      '# Anhang',
      '',
      '## Leitfaden <a id="sec-guide"></a>',
      '',
      '## Daten',
      '',
      '[Kapitel 5](#sec-weg)',
      '',
    ].join('\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.html).toContain('<h2 data-line="4" id="sec-methods"><span class="heading-number">1.1</span> Methoden</h2>');
    expect(body.html).toContain('<a href="#sec-methods">Kapitel 1.1</a>, <a href="#sec-methods">Chapter 1.1</a>, <a href="#sec-methods">die Methoden</a>, <a href="#sec-guide">Anhang A</a> und <a href="#sec-toc">Kapitel 3</a>');
    expect(body.headings.find((heading) => heading.id === 'sec-toc')).toMatchObject({ text: 'Literaturverzeichnis', section: 'BIB' });
    expect(body.html).toContain('<a href="#sec-methods"><span class="contents-number">1.1</span><span class="contents-text">Methoden</span></a>');
    expect(body.html).not.toContain('<a id=');
    expect(body.problems).toEqual([{ severity: 'warning', message: 'The link #sec-weg names no figure, table or heading of the file.', line: 16 }]);
  });
});

test('each block names its line in the file (R-PRV-003)', () => {
  const html = renderBody('\n\n# Teil\n\nText\n\n- Punkt\n', layoutOf()).html;
  expect(html).toContain('<h1 data-line="2"');
  expect(html).toContain('<p data-line="4">Text</p>');
  expect(html).toContain('<ul data-line="6">');
});
