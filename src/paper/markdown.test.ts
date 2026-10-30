// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { hyphenatorOf, softHyphen } from './hyphenate';
import { type Layout, termsFor } from './layout';
import { emptyFound, type MarkdownPlugin, paperPlugin, paperTokenType, renderBody } from './markdown';

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
  numberedSections: [],
  contentsDepth: 3,
  contentsFront: true,
  hyphenate: false,
  references: { hyphenate: false },
  listings: { lineNumbers: false },
  pdfName: '{{file}}',
  terms: termsFor('de-AT'),
  ...changes,
});

/** example is the example of docs/format.md of nimblescape Markdown Notes, version 1.0.0, with a footnote of its own. */
const example = `<!-- nimblescape-markdown-notes v1.0.0 spec=https://github.com/nimblescape/markdownnotes-vscode/blob/main/docs/format.md
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

  test('the pages leave out the start marker of an argument to research and keep its "(RESEARCH)" (R-CITE-002)', () => {
    const body = renderBody('<wbr><!--[research-->Feedback changes learning (RESEARCH).\n', layoutOf());
    expect(body.html).toContain('>Feedback changes learning (RESEARCH).</p>');
    expect(body.html).not.toContain('research--');
    expect(body.html).not.toContain('<wbr>');
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
    expect(html).toContain('<h1 data-line="0" id="begriffe--" class="unnumbered">Begriffe</h1>');
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

  test('a heading has the ID that GitHub gives it, so that a Markdown link to it works on GitHub and on the pages', () => {
    const body = renderBody('# Teil\n\n# Teil\n\n## Einführung: Ziele & `Code`\n\n# Quellen {BIB}\n', layoutOf());
    expect(body.headings.map((heading) => heading.id)).toEqual(['teil', 'teil-1', 'einführung-ziele--code', 'quellen-bib']);
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

  test('a special section of headings.numberedSections gets a number as other chapters do', () => {
    const body = renderBody('# Einleitung\n\n# Quellen\n\n## Gesetze\n\n# Literatur {BIB}\n', layoutOf({ numberedSections: ['BIB'] }));
    expect(body.headings.map((heading) => [heading.text, heading.number, heading.section])).toEqual([
      ['Einleitung', '1', undefined],
      ['Quellen', '2', 'BIB'],
      ['Gesetze', '2.1', undefined],
      ['Literatur', '3', 'BIB'],
    ]);
    expect(body.html).toContain('<h1 data-line="2" id="quellen" class="section-bib" data-section="BIB"><span class="heading-number">2</span> Quellen</h1>');
  });

  test('the front matter, the body and the appendix part are each in an element, and a special section of the front part gets no number (R-REN-013)', () => {
    const markdown = ['# Abstract', 'A.', '# Inhaltsverzeichnis', '# Abbildungsverzeichnis', '# Einleitung', 'B.', '# Abbildungsverzeichnis {LOF}', '# Literaturverzeichnis', 'C.', '# Anhang', '## Leitfaden', 'D.', ''].join('\n\n');
    const body = renderBody(markdown, layoutOf({ numberedSections: ['LOF', 'BIB'] }));
    expect(body.headings.map((heading) => [heading.text, heading.number, heading.section])).toEqual([
      ['Abstract', '', 'AST'],
      ['Inhaltsverzeichnis', '', 'TOC'],
      ['Abbildungsverzeichnis', '', 'LOF'],
      ['Einleitung', '1', undefined],
      ['Abbildungsverzeichnis', '2', 'LOF'],
      ['Literaturverzeichnis', '3', 'BIB'],
      ['Anhang', '', 'APX'],
      ['Leitfaden', 'Anhang', 'APX-A'],
    ]);
    expect(body.html.startsWith('<div class="paper-part paper-front">\n<h1 ')).toBe(true);
    expect(body.html).toMatch(/<\/nav>\n<\/div>\n<div class="paper-part paper-body">\n<h1 data-line="\d+" id="einleitung">/);
    expect(body.html).toMatch(/<\/section>\n<\/div>\n<div class="paper-part paper-appendix">\n<h1 data-line="\d+" id="anhang"/);
    expect(body.html.endsWith('<p data-line="22">D.</p>\n</div>\n')).toBe(true);
    expect(body.html.match(/<div class="paper-part/g)).toHaveLength(3);
    expect(body.html.match(/<\/div>/g)).toHaveLength(3);
  });

  test('a document of chapters alone has the body part, and the text before its first chapter is in no part', () => {
    const html = renderBody('Vorab.\n\n# Einleitung\n\nText.\n', layoutOf()).html;
    expect(html.trim()).toBe('<p data-line="0">Vorab.</p>\n<div class="paper-part paper-body">\n<h1 data-line="2" id="einleitung"><span class="heading-number">1</span> Einleitung</h1>\n<p data-line="4">Text.</p>\n</div>');
  });

  test('English words count in an English layout', () => {
    const body = renderBody('# Table of Contents\n\n# Introduction\n\n# References\n', layoutOf({ language: 'en-US', terms: termsFor('en-US') }));
    expect(body.headings.map((heading) => heading.section)).toEqual(['TOC', undefined, 'BIB']);
  });

  test('the table of contents lists every heading but its own, with the numbers and the links to the pages', () => {
    const html = renderBody('# Abstract\n\n# Inhaltsverzeichnis\n\nOld text.\n\n# Einleitung\n\n## Frage\n', layoutOf()).html;
    expect(html).not.toContain('Old text');
    expect(html).toContain('<nav class="contents no-hyphens"><ol>');
    expect(html).toContain('<li class="contents-level-1 unnumbered contents-front"><a href="#abstract"><span class="contents-text">Abstract</span></a></li>');
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

  test('the reference list gets soft hyphens with references.hyphenate, but not its web addresses', () => {
    const hyphenate = hyphenatorOf('de-AT');
    const markdown = '# Literaturverzeichnis\n\nWirtschaftspädagogik. [https://example.org/wirtschaftspaedagogik](https://example.org/wirtschaftspaedagogik)\n';
    const html = renderBody(markdown, layoutOf({ hyphenate: true, references: { hyphenate: true } }), hyphenate).html;
    expect(html).toContain('<section class="references">');
    expect(html).toContain(`Wirt${softHyphen}schafts${softHyphen}päd${softHyphen}ago${softHyphen}gik.`);
    expect(html).toContain('>https://example.org/wirtschaftspaedagogik</a>');
  });
});

describe('lists of the special sections (R-REN-004)', () => {
  test('a special section shows the list of the file between its markers, with the elements of the list of the renderer', () => {
    const markdown = [
      '# Inhaltsverzeichnis',
      '',
      '<!-- toc -->',
      '- [1 Einleitung](#einleitung)',
      '- [1.1 Methoden](#methoden)',
      '- [Literaturverzeichnis](#literaturverzeichnis)',
      '- [Anhang A: Daten](#daten)',
      '- [2 Weg](#weg)',
      '<!-- /toc -->',
      '',
      '# Verzeichnis der Listings',
      '',
      '<!-- lol -->',
      '- [Listing 1: Lesen](#lst-lesen)',
      '<!-- /lol -->',
      '',
      '# Abbildungsverzeichnis',
      '',
      'Kein Eintrag.',
      '',
      '# Einleitung',
      '',
      '## Methoden',
      '',
      'Listing 1: Lesen <a id="lst-lesen"></a>',
      '',
      '```ts',
      'a();',
      '```',
      '',
      'Figure 1: Bild',
      '',
      '![Bild](b.png)',
      '',
      '# Literaturverzeichnis',
      '',
      '# Anhang',
      '',
      '## Daten',
      '',
      '## Mehr',
      '',
    ].join('\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.html).toContain(
      '<nav class="contents no-hyphens"><ol>\n' +
        '<li class="contents-level-1"><a href="#einleitung"><span class="contents-number">1</span><span class="contents-text">Einleitung</span></a></li>\n' +
        '<li class="contents-level-2"><a href="#methoden"><span class="contents-number">1.1</span><span class="contents-text">Methoden</span></a></li>\n' +
        '<li class="contents-level-1 unnumbered"><a href="#literaturverzeichnis"><span class="contents-text">Literaturverzeichnis</span></a></li>\n' +
        '<li class="contents-level-2 appendix contents-appendix"><a href="#daten"><span class="contents-text"><span class="appendix-label">Anhang A</span><span class="appendix-separator">: </span>Daten</span></a></li>\n' +
        '<li class="contents-level-1"><a href="#weg"><span class="contents-number">2</span><span class="contents-text">Weg</span></a></li>\n</ol></nav>',
    );
    expect(body.html).toContain(
      '<nav class="list-of-listings no-hyphens"><ol>\n<li><a href="#lst-lesen"><span class="caption-entry"><span class="caption-label">Listing 1</span>' +
        '<span class="caption-separator">: </span><span class="caption-text">Lesen</span></span></a></li>\n</ol></nav>',
    );
    // A section without the markers gets the list of the renderer, and the rest of a section does not show.
    expect(body.html).toContain('<nav class="list-of-figures no-hyphens"><ol>\n<li><a href="#figure-1">');
    expect(body.html).not.toContain('Kein Eintrag');
    expect(body.html).not.toContain('<!--');
    expect(body.problems).toEqual([{ severity: 'warning', message: 'The entry #weg of the TOC names no heading, figure, table or listing of the file.', line: 7 }]);
  });

  test('finds the heading of an entry whose target has letters outside ASCII', () => {
    const markdown = ['# Inhaltsverzeichnis', '', '<!-- toc -->', '- [Eidesstattliche Erklärung](#eidesstattliche-erklärung)', '<!-- /toc -->', '', '# Eidesstattliche Erklärung', ''].join('\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.problems).toEqual([]);
    // The page of the entry needs the ID without escapes in the link.
    expect(body.html).toContain('<a href="#eidesstattliche-erklärung">');
  });
});

describe('figures and tables (R-REN-005)', () => {
  test('a paragraph "Figure 1:" directly before an image alone in its paragraph is the caption of the figure, above the image, listed in the list of figures', () => {
    const markdown = '# Abbildungsverzeichnis\n\n# Teil\n\nFigure 1: Die Rollen\n\n![Rollen im Team](rollen.png)\n\nText ![Icon](icon.png) im Satz.\n\n![Das Logo](logo.png)\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.figures).toEqual([{ id: 'figure-1', label: 'Abbildung 1', text: 'Die Rollen', line: 4 }]);
    expect(body.html).toContain(
      '<figure data-line="4" class="figure" id="figure-1"><figcaption><span class="caption-label">Abbildung 1</span><span class="caption-separator">: </span>' +
        '<span class="caption-text">Die Rollen</span></figcaption><img src="rollen.png" alt="Rollen im Team"></figure>\n<p data-line="8">',
    );
    expect(body.html).toContain('<p data-line="8">Text <img src="icon.png" alt="Icon"> im Satz.</p>');
    // An image without a caption line is a figure without a caption and without a number.
    expect(body.html).toContain('<figure data-line="10" class="figure"><img src="logo.png" alt="Das Logo"></figure>');
    expect(body.html).toContain('<nav class="list-of-figures no-hyphens"><ol>\n<li><a href="#figure-1"><span class="caption-entry"><span class="caption-label">Abbildung 1</span>');
  });

  test('a paragraph "Table 1:" directly before a table is its caption with the number of the file, listed in the list of tables', () => {
    const markdown = '# Tabellenverzeichnis\n\n# Teil\n\nTable: Teilnehmende\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTabelle 7: Zweite\n\n| c |\n| - |\n| 3 |\n\nTable: no table follows\n';
    const body = renderBody(markdown, layoutOf());
    // The number of the file stays; a caption without a number gets the next number.
    expect(body.tables.map((table) => [table.label, table.text])).toEqual([
      ['Tabelle 1', 'Teilnehmende'],
      ['Tabelle 7', 'Zweite'],
    ]);
    expect(body.html).toContain('<p data-line="4" id="table-1" class="caption table-caption"><span class="caption-label">Tabelle 1</span><span class="caption-separator">: </span><span class="caption-text">Teilnehmende</span></p>');
    expect(body.html).toContain('<p data-line="16">Table: no table follows</p>');
    expect(body.html).toContain('<nav class="list-of-tables no-hyphens">');
  });

  test('the appendices are A, B, and their figures and tables are numbered A1, B1 (R-REN-006)', () => {
    const markdown = '# Teil\n\nFigure: Eins\n\n![Eins](1.png)\n\n# Anhang\n\n## Leitfaden\n\nFigure: Zwei\n\n![Zwei](2.png)\n\n## Transkript\n\nTable: Kodes\n\n| a |\n| - |\n| 1 |\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.figures.map((figure) => figure.label)).toEqual(['Abbildung 1', 'Abbildung A1']);
    expect(body.tables.map((table) => table.label)).toEqual(['Tabelle B1']);
    expect(body.headings.filter((heading) => heading.appendix).map((heading) => heading.number)).toEqual(['Anhang A', 'Anhang B']);
    expect(body.html).toContain('<h2 data-line="8" id="leitfaden" class="appendix" data-section="APX-A"><span class="appendix-label">Anhang A</span> Leitfaden</h2>');
  });
});

describe('links to figures and tables (R-REN-009)', () => {
  test('the anchor of /figure and /table names the figure or the table, and a link to it gets its label', () => {
    const markdown = [
      'Siehe [Table 1](#tab-noten), [Figure 2](#fig-plan) und [den Plan](#fig-plan).',
      '',
      'Figure 1: Der Plan <a id="fig-plan"></a>',
      '',
      '![Plan der Studie](plan.png)',
      '',
      'Abbildung: Der Ablauf',
      '',
      '![Ablauf](ablauf.png) <a id="fig-ablauf"></a>',
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
      'Wie [Tabelle 9](#tab-roh) zeigt; [Table 3](#tab-fehlt); [Figure 5](#fig-ablauf).',
      '',
    ].join('\n');
    const body = renderBody(markdown, layoutOf());
    // The anchor of a figure stands at the end of its caption or of its image.
    expect(body.figures).toEqual([
      { id: 'fig-plan', label: 'Abbildung 1', text: 'Der Plan', line: 2 },
      { id: 'fig-ablauf', label: 'Abbildung 2', text: 'Der Ablauf', line: 6 },
    ]);
    expect(body.tables.map((table) => [table.id, table.label, table.text])).toEqual([
      ['tab-noten', 'Tabelle 1', 'Noten'],
      ['tab-roh', 'Tabelle A1', 'Rohdaten'],
    ]);
    expect(body.html).toContain('<a href="#tab-noten">Tabelle 1</a>, <a href="#fig-plan">Abbildung 1</a> und <a href="#fig-plan">den Plan</a>');
    expect(body.html).toContain(
      '<figure data-line="2" class="figure" id="fig-plan"><figcaption><span class="caption-label">Abbildung 1</span><span class="caption-separator">: </span>' +
        '<span class="caption-text">Der Plan</span></figcaption><img src="plan.png" alt="Plan der Studie"></figure>',
    );
    expect(body.html).toContain('<figure data-line="6" class="figure" id="fig-ablauf"><figcaption><span class="caption-label">Abbildung 2</span>');
    expect(body.html).toContain('<img src="ablauf.png" alt="Ablauf"></figure>');
    expect(body.html).toContain('<p data-line="10" id="tab-noten" class="caption table-caption"><span class="caption-label">Tabelle 1</span><span class="caption-separator">: </span><span class="caption-text">Noten</span></p>');
    expect(body.html).toContain('<span class="caption-text">Rohdaten</span></p>');
    expect(body.html).toContain('Wie <a href="#tab-roh">Tabelle A1</a> zeigt; <a href="#tab-fehlt">Table 3</a>; <a href="#fig-ablauf">Abbildung 2</a>.');
    expect(body.html).not.toContain('<a id=');
    expect(body.problems).toEqual([{ severity: 'warning', message: 'The link #tab-fehlt names no figure, table, listing or heading of the file.', line: 27 }]);
  });

  test('a Markdown link to a heading gets the number of the heading or the label of the appendix, also through an anchor at the end of the heading', () => {
    const markdown = [
      '# Inhaltsverzeichnis',
      '',
      '# Einleitung',
      '',
      '## Methoden<a id="sec-methods"></a>',
      '',
      'Siehe [Kapitel 1.4](#methoden), [Chapter 9](#sec-methods), [die Methoden](#methoden), [Anhang C](#leitfaden-), [Anhang D](#sec-data) und [Kapitel 3](#literaturverzeichnis-bib-).',
      '',
      '# Literaturverzeichnis {BIB} <a id="sec-toc"></a>',
      '',
      '# Anhang',
      '',
      '## Leitfaden <a id="sec-guide"></a>',
      '',
      '## Daten<a id="sec-data"></a>',
      '',
      '[Kapitel 5](#sec-weg), [Kapitel 6](#leitfaden)',
      '',
    ].join('\n');
    const body = renderBody(markdown, layoutOf());
    expect(body.html).toContain('<h2 data-line="4" id="methoden"><span class="heading-number">1.1</span> Methoden<a id="sec-methods"></a></h2>');
    expect(body.html).toContain(
      '<a href="#methoden">Kapitel 1.1</a>, <a href="#sec-methods">Chapter 1.1</a>, <a href="#methoden">die Methoden</a>, <a href="#leitfaden-">Anhang A</a>, ' +
        '<a href="#sec-data">Anhang B</a> und <a href="#literaturverzeichnis-bib-">Kapitel 3</a>',
    );
    expect(body.headings.find((heading) => heading.anchor === 'sec-toc')).toMatchObject({ id: 'literaturverzeichnis-bib-', text: 'Literaturverzeichnis', section: 'BIB' });
    expect(body.html).toContain('<a href="#methoden"><span class="contents-number">1.1</span><span class="contents-text">Methoden</span></a>');
    // GitHub keeps the space before the anchor in the ID, so `#leitfaden` names no heading.
    expect(body.problems).toEqual([
      { severity: 'warning', message: 'The link #sec-weg names no figure, table, listing or heading of the file.', line: 16 },
      { severity: 'warning', message: 'The link #leitfaden names no figure, table, listing or heading of the file.', line: 16 },
    ]);
  });
});

describe('listings (R-REN-011)', () => {
  /** listings is a file with a listing of a snippet, a listing of a whole file, and a caption without code. */
  const listings = [
    'Wie [Listing 9](#lst-reading-fields) zeigt.',
    '',
    'Listing 1: [Reading the fields](../src/fields.ts#L12-L30) (fields.ts, L12-L30)<a id="lst-reading-fields"></a>',
    '',
    '<!-- listing: ../src/fields.ts#read-fields -->',
    '',
    '```typescript',
    'export function readFields() {',
    '  return 1;',
    '}',
    '```',
    '',
    'Listing 2: Die ganze Datei',
    '<!-- listing: ../src/my%20server.ts -->',
    '```ts',
    'const a = 1;',
    '```',
    '',
    'Listing: kein Code folgt',
    '',
    '[Listing 3](#lst-fehlt)',
    '',
  ].join('\n');

  test('a paragraph "Listing 1:" before the comment of the source and the code is its caption, which shows the text of its link and the cite of the file', () => {
    const body = renderBody(listings, layoutOf(), hyphenatorOf('de-AT'));
    expect(body.listings).toEqual([
      { id: 'lst-reading-fields', label: 'Listing 1', text: 'Reading the fields', line: 2 },
      { id: 'listing-2', label: 'Listing 2', text: 'Die ganze Datei', line: 12 },
    ]);
    expect(body.html).toContain(
      '<p data-line="2" id="lst-reading-fields" class="caption listing-caption"><span class="caption-label">Listing 1</span><span class="caption-separator">: </span>' +
        '<span class="caption-text">Reading the fields</span><span class="caption-source"> (fields.ts, L12-L30)</span></p>',
    );
    expect(body.html).toContain('<pre class="listing"><code class="language-typescript">export function readFields() {\n  return 1;\n}\n</code></pre>');
    // A caption without the cite of the file shows none: the renderer adds no cite of its own.
    expect(body.html).toContain('<span class="caption-text">Die ganze Datei</span></p>');
    expect(body.html).toContain(`<p data-line="18">Lis${softHyphen}ting: kein Code folgt</p>`);
    expect(body.html).toContain('Wie <a href="#lst-reading-fields">Listing 1</a> zeigt.');
    expect(body.html).not.toContain('<a id=');
    expect(body.html).not.toContain('href="../src');
    expect(body.problems).toEqual([{ severity: 'warning', message: 'The link #lst-fehlt names no figure, table, listing or heading of the file.', line: 20 }]);
  });

  test('a listing keeps the number of its caption in the file', () => {
    const body = renderBody('Listing 4: Vier\n\n```ts\na();\n```\n\nListing: Fünf\n\n```ts\nb();\n```\n', layoutOf());
    expect(body.listings.map((listing) => [listing.id, listing.label])).toEqual([
      ['listing-4', 'Listing 4'],
      ['listing-5', 'Listing 5'],
    ]);
  });

  test('the cite of a file whose name looks like an address stays text, and the list of listings has the caption without the cite', () => {
    const markdown = 'Listing 1: [Der Server](../src/server.py) (server.py)\n\n<!-- listing: ../src/server.py -->\n\n```python\nrun()\n```\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.html).toContain('<span class="caption-text">Der Server</span><span class="caption-source"> (server.py)</span></p>');
    expect(body.listings.map((listing) => listing.text)).toEqual(['Der Server']);
  });

  test('the layout puts the number of each line from 1 before the code of each listing, and not before other code', () => {
    const markdown = `${listings}\n\`\`\`ts\nother();\n\`\`\`\n`;
    const html = renderBody(markdown, layoutOf({ listings: { lineNumbers: true } })).html;
    expect(html).toContain(
      '<code class="language-typescript"><span class="line-number" data-number="1" aria-hidden="true"></span>export function readFields() {\n' +
        '<span class="line-number" data-number="2" aria-hidden="true"></span>  return 1;\n' +
        '<span class="line-number" data-number="3" aria-hidden="true"></span>}\n</code>',
    );
    expect(html).toContain('<pre class="listing"><code class="language-ts"><span class="line-number" data-number="1" aria-hidden="true"></span>const a = 1;\n</code></pre>');
    expect(html).toContain('<pre><code class="language-ts">other();\n</code></pre>');
  });

  test('the numbers of the lines go inside the element of a highlighter, as in the Markdown preview of VS Code', () => {
    const md: MarkdownIt = new MarkdownIt({ html: true, highlight: (code): string => `<div>${md.utils.escapeHtml(code)}</div>` });
    paperPlugin(md);
    const env = { nimblescapePaper: { layout: layoutOf({ listings: { lineNumbers: true } }), found: emptyFound() } };
    const html = md.render('Listing: Zwei Zeilen\n\n<!-- listing: a.ts -->\n\n```ts\na();\nb();\n```\n', env);
    expect(html).toContain(
      '<code class="language-ts"><div><span class="line-number" data-number="1" aria-hidden="true"></span>a();\n' +
        '<span class="line-number" data-number="2" aria-hidden="true"></span>b();\n</div></code>',
    );
  });

  test('the listings of the appendices are numbered A1, and the captions get no soft hyphens', () => {
    const markdown = '# Teil\n\nListing: Wirtschaftspädagogik\n\n```ts\na();\n```\n\n# Anhang\n\n## Code\n\nListing: Unterrichtsplanung\n\n```ts\nb();\n```\n';
    const body = renderBody(markdown, layoutOf({ hyphenate: true }), hyphenatorOf('de-AT'));
    expect(body.listings.map((listing) => [listing.id, listing.label])).toEqual([
      ['listing-1', 'Listing 1'],
      ['listing-a1', 'Listing A1'],
    ]);
    expect(body.html).toContain('<span class="caption-text">Wirtschaftspädagogik</span>');
    expect(body.html).toContain('<span class="caption-text">Unterrichtsplanung</span>');
  });
});

test('the caption of a table gets no soft hyphens (R-REN-007)', () => {
  const body = renderBody('Table: Wirtschaftspädagogik\n\n| a |\n| - |\n| 1 |\n', layoutOf({ hyphenate: true }), hyphenatorOf('de-AT'));
  expect(body.html).toContain('<span class="caption-text">Wirtschaftspädagogik</span>');
});

test('each block names its line in the file (R-PRV-003)', () => {
  const html = renderBody('\n\n# Teil\n\nText\n\n- Punkt\n', layoutOf()).html;
  expect(html).toContain('<h1 data-line="2"');
  expect(html).toContain('<p data-line="4">Text</p>');
  expect(html).toContain('<ul data-line="6">');
});

describe('the plugin of the renderer in another markdown-it (R-PRV-005, R-REN-010)', () => {
  /** mermaid is a plugin like the one of Mermaid in VS Code: a fence `mermaid` becomes a div that its script draws. */
  const mermaid: MarkdownPlugin = (md) => {
    const fence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, index, options, env, self) =>
      tokens[index].info.trim() === 'mermaid' ? `<div class="mermaid">${md.utils.escapeHtml(tokens[index].content)}</div>\n` : (fence?.(tokens, index, options, env, self) ?? '');
    return md;
  };

  test('the plugins of other extensions work before the rule, and their content gets no soft hyphens', () => {
    const markdown = '# Einleitung\n\n```mermaid\nflowchart LR\n  Wirtschaftspädagogik --> Unterrichtsplanung\n```\n\nWirtschaftspädagogik ist ein Fach.\n';
    const body = renderBody(markdown, layoutOf(), hyphenatorOf('de-AT'), [mermaid]);
    expect(body.html).toContain('<div class="mermaid">flowchart LR\n  Wirtschaftspädagogik --&gt; Unterrichtsplanung\n</div>');
    expect(body.html).toContain(`Wirt${softHyphen}schafts`);
    expect(body.html).toContain('<span class="heading-number">1</span> Einleitung');
  });

  test('without nimblescapePaper in the environment, a notes document keeps its rendering: no footnotes, no numbers', () => {
    const md = new MarkdownIt();
    paperPlugin(md);
    const notes = md.render('# Notizen\n\nText[^1]\n\n[^1]: Eine Fußnote.\n', {});
    expect(notes).toBe('<h1>Notizen</h1>\n<p>Text[^1]</p>\n<p>[^1]: Eine Fußnote.</p>\n');
    const env = { nimblescapePaper: { layout: layoutOf(), found: emptyFound() } };
    const tokens = md.parse('# Teil\n\nText[^1]\n\n[^1]: Eine Fußnote.\n', env);
    expect(tokens[0].type).toBe(paperTokenType);
    expect(tokens[0].meta).toBe(env.nimblescapePaper);
    expect(env.nimblescapePaper.found.headings.map((heading) => heading.number)).toEqual(['1']);
    expect(md.renderer.render(tokens, md.options, env)).toContain('<span class="footnote"');
  });
});
