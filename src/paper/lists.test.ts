// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { type Layout, termsFor } from '@nimblescape/markdownlayout';
import { describe, expect, test } from 'vitest';
import { listInsertion, writeLists } from './lists';
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
  numberedSections: [],
  contentsDepth: 2,
  contentsFront: true,
  hyphenate: false,
  references: { hyphenate: false },
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

  test('with contents.front false, the table of contents leaves out the chapters of the front part (R-REN-013)', () => {
    const written = writeLists(paper, { ...layout, contentsFront: false });
    expect(written.slice(5, 12)).toEqual(['<!-- toc -->', '- [1 Einleitung](#einleitung)', '- [1.1 Methoden und Daten](#methoden-und-daten)', '- [Literaturverzeichnis](#literaturverzeichnis)', '- [Anhang](#anhang)', '- [Anhang A: Leitfaden](#leitfaden)', '- [Anhang B: Daten](#daten)']);
    const html = renderBody(['# Abstract', '# Inhaltsverzeichnis', '# Einleitung', ''].join('\n\n'), { ...layout, contentsFront: false }).html;
    expect(html).toContain('<nav class="contents no-hyphens"><ol>\n<li class="contents-level-1"><a href="#einleitung">');
    expect(html).not.toContain('href="#abstract"');
  });

  test('a file without a special section with a list keeps its lines', () => {
    const lines = ['# Einleitung', '', 'Text', ''];
    expect(writeLists(lines, layout)).toEqual(lines);
  });

  test('a list at the end of the file gets its markers after the heading', () => {
    expect(writeLists(['# Inhaltsverzeichnis'], layout)).toEqual(['# Inhaltsverzeichnis', '', '<!-- toc -->', '<!-- /toc -->']);
  });
});

describe('the slash commands of the lists insert a special section with its list (R-REN-004)', () => {
  /** figured is a document with a figure and no list. */
  const figured = ['---', 'layout: test', '---', '', '# Einleitung', '', 'Text des Kapitels.', 'Noch eine Zeile.', '', 'Figure 1: Die Rollen <a id="fig-rollen"></a>', '', '![Rollen](rollen.png)', ''].join('\n');
  /** applied returns a text with a change. */
  const applied = (text: string, change: { from: number; to: number; text: string }) => text.slice(0, change.from) + change.text + text.slice(change.to);

  test('on an empty line, the heading in the language of the layout and the list between its markers take the line', () => {
    const at = figured.indexOf('\n\n# Einleitung') + 1;
    const change = listInsertion(figured, at, 'LOF', layout);
    expect('exists' in change).toBe(false);
    if ('exists' in change) return;
    const after = applied(figured, change);
    expect(after).toContain('---\n\n# Abbildungsverzeichnis\n\n<!-- lof -->\n- [Abbildung 1: Die Rollen](#fig-rollen)\n<!-- /lof -->\n\n# Einleitung');
    expect(change.text.slice(change.heading.from, change.heading.to)).toBe('Abbildungsverzeichnis');
    // The format step keeps the list as it is.
    expect(writeLists(after.split('\n'), layout).join('\n')).toContain('<!-- lof -->\n- [Abbildung 1: Die Rollen](#fig-rollen)\n<!-- /lof -->');
  });

  test('in a paragraph, the section comes after the paragraph with an empty line around it', () => {
    const change = listInsertion(figured, figured.indexOf('Text des'), 'TOC', layout);
    if ('exists' in change) throw new Error('no change');
    expect(applied(figured, change)).toContain('Noch eine Zeile.\n\n# Inhaltsverzeichnis\n\n<!-- toc -->\n- [1 Einleitung](#einleitung)\n<!-- /toc -->\n\nFigure 1:');
    expect(change.text.slice(change.heading.from, change.heading.to)).toBe('Inhaltsverzeichnis');
  });

  test('takes the list from the text of the file, which the clean editing view of Markdown Notes shows without the anchors', () => {
    const clean = figured.replace(' <a id="fig-rollen"></a>', '');
    const change = listInsertion(clean, clean.indexOf('Noch'), 'LOF', layout, figured);
    if ('exists' in change) throw new Error('no change');
    expect(change.text).toContain('- [Abbildung 1: Die Rollen](#fig-rollen)');
  });

  test('at the end of the file, a line follows the end marker of the section', () => {
    const atEnd = listInsertion(`${figured}\n`, figured.length + 1, 'LOF', layout);
    if ('exists' in atEnd) throw new Error('no change');
    expect(applied(`${figured}\n`, atEnd).endsWith('\n\n# Abbildungsverzeichnis\n\n<!-- lof -->\n- [Abbildung 1: Die Rollen](#fig-rollen)\n<!-- /lof -->\n')).toBe(true);
    const unended = figured.replace(/\n$/, '');
    const afterParagraph = listInsertion(unended, unended.indexOf('![Rollen]'), 'TOC', layout);
    if ('exists' in afterParagraph) throw new Error('no change');
    expect(applied(unended, afterParagraph).endsWith('<!-- /toc -->\n')).toBe(true);
  });

  test('a document with the section gets the line of its heading', () => {
    expect(listInsertion(paper.join('\n'), 0, 'LOT', layout)).toEqual({ exists: 8 });
  });

  test('the markers of the list count also under a heading with other words, but not in code', () => {
    const renamed = figured.replace('# Einleitung', '# Übersicht der Arbeit\n\n<!-- toc -->\n- [1 Einleitung](#einleitung)\n<!-- /toc -->\n\n# Einleitung');
    expect(listInsertion(renamed, renamed.length, 'TOC', layout)).toEqual({ exists: 4, marked: true });
    const fenced = figured.replace('# Einleitung', '```markdown\n<!-- toc -->\n```\n\n# Einleitung');
    expect('exists' in listInsertion(fenced, fenced.length, 'TOC', layout)).toBe(false);
  });
});
