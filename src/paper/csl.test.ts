// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the citation styles (R-CITE-003): the built-in style apa7 and the style pht-apa7.csl of the PHT
 * layout, a copy of apa.csl with the German terms of the guide of the PHT. test/fixtures/pht-apa7.csl is a copy of
 * thesis/pht-apa7.csl of the repository majikmate/markdownpaper-layout-pht. The cases are the patterns of
 * the guide of the PHT: the entries of books, edited books, chapters, articles, reports, theses, posts of a blog and of
 * social media, and the citations with one, two and more authors, a page, no year, no author, and two works of the
 * same authors in one year.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { builtinStyles, type Cite, cite, type CitationStyle, citationStyleOf, localeOf, type Source } from './csl';
import { type Layout, termsFor } from './layout';

const apa7: CitationStyle = { name: 'apa7', xml: builtinStyles.apa7 };
const pht: CitationStyle = { name: 'pht-apa7.csl', xml: fs.readFileSync(path.join(__dirname, '../../test/fixtures/pht-apa7.csl'), 'utf8') };
const person = (family: string, given: string) => ({ family, given });

/** entryOf returns the entry of one source in a style, in the language de-AT. */
const entryOf = (source: Source, style = pht): string => cite(style, 'de-AT', [source], [{ id: source.id, form: 'parenthetical' }]).entries[0]?.text ?? '';

/** citationsOf returns the texts of citations in a style, in the language de-AT. */
const citationsOf = (sources: Source[], cites: Cite[], style = pht): string[] => cite(style, 'de-AT', sources, cites).citations;

const kriesche: Source = { id: 'kriesche2019', type: 'book', author: [person('Kriesche', 'Jürgen'), person('Kahlert', 'Joachim')], issued: { 'date-parts': [[2019]] }, title: 'Lehrer werden mit Methode', publisher: 'Julius Klinkhardt' };
const festman: Source = {
  id: 'festman2019',
  type: 'article-journal',
  author: [person('Festman', 'Julia'), person('Schwieter', 'John W.')],
  issued: { 'date-parts': [[2019, 4]] },
  title: 'Self-concepts in reading and spelling among mono- and multilingual children: Extending the bilingual advantage',
  'container-title': 'Behavioral Science',
  volume: 9,
  page: '39',
  DOI: '10.3390/bs9040039',
};

describe('the entry of a source in the style of the PHT (R-CITE-003)', () => {
  test('of a book, an edited book and a chapter in an edited book', () => {
    expect(entryOf(kriesche)).toBe('Kriesche, J., & Kahlert, J. (2019). *Lehrer werden mit Methode*. Julius Klinkhardt.');
    const edited: Source = {
      id: 'paechter2012',
      type: 'book',
      editor: [person('Paechter', 'Manuela'), person('Stock', 'Michaela'), person('Schmölzer-Eibinger', 'Sabine'), person('Slepcevic-Zach', 'Peter'), person('Weirer', 'Wolfgang')],
      issued: { 'date-parts': [[2012]] },
      title: 'Handbuch Kompetenzorientierter Unterricht',
      publisher: 'Beltz',
    };
    expect(entryOf(edited)).toBe('Paechter, M., Stock, M., Schmölzer-Eibinger, S., Slepcevic-Zach, P., & Weirer, W. (Hrsg.). (2012). *Handbuch Kompetenzorientierter Unterricht*. Beltz.');
    const chapter: Source = {
      id: 'damberger2017',
      type: 'chapter',
      author: [person('Damberger', 'Thomas')],
      editor: [person('Hübner', 'Edwin'), person('Weiss', 'Leonard')],
      issued: { 'date-parts': [[2017]] },
      title: 'Die Rolle der Lehrerpersönlichkeit angesichts der Möglichkeiten digitaler Technik',
      'container-title': 'Personalität in Schule und Lehrerbildung: Perspektiven in Zeiten der Ökonomisierung und Digitalisierung',
      page: '51-70',
      publisher: 'Barbara Budrich',
    };
    expect(entryOf(chapter)).toBe(
      'Damberger, T. (2017). Die Rolle der Lehrerpersönlichkeit angesichts der Möglichkeiten digitaler Technik. In E. Hübner & L. Weiss (Hrsg.), *Personalität in Schule und Lehrerbildung: Perspektiven in Zeiten der Ökonomisierung und Digitalisierung* (S. 51\u00a0–\u00a070). Barbara Budrich.',
    );
  });

  test('of an article, a report of a group, a thesis, a post of a blog and of social media', () => {
    expect(entryOf(festman)).toBe(
      'Festman, J., & Schwieter, J. W. (2019). Self-concepts in reading and spelling among mono- and multilingual children: Extending the bilingual advantage. *Behavioral Science, 9*, 39. https://doi.org/10.3390/bs9040039',
    );
    expect(entryOf({ ...festman, issue: 4 })).toContain('*Behavioral Science, 9*(4), 39. https://doi.org/10.3390/bs9040039');
    const report: Source = { id: 'bmbwf2020', type: 'report', author: [{ literal: 'Bundesministerium Bildung, Wissenschaft und Forschung' }], issued: { 'date-parts': [[2020]] }, title: 'Masterplan Digitalisierung', URL: 'https://www.bmbwf.gv.at/Themen/schule/zrp/dibi.html' };
    expect(entryOf(report)).toBe('Bundesministerium Bildung, Wissenschaft und Forschung. (2020). *Masterplan Digitalisierung*. https://www.bmbwf.gv.at/Themen/schule/zrp/dibi.html');
    const thesis: Source = {
      id: 'primus2022',
      type: 'thesis',
      author: [person('Primus', 'Petra')],
      issued: { 'date-parts': [[2022]] },
      title: 'Der Digitale Blick auf das Schreiben mit der Hand. Analyse und Förderung der Schreibmotorik in der Volksschule',
      genre: 'Masterarbeit',
      publisher: 'Pädagogische Hochschule Tirol',
    };
    expect(entryOf(thesis)).toBe('Primus, P. (2022). *Der Digitale Blick auf das Schreiben mit der Hand. Analyse und Förderung der Schreibmotorik in der Volksschule* \\[Masterarbeit\\]. Pädagogische Hochschule Tirol.');
    const blog: Source = {
      id: 'arnold2018',
      type: 'post-weblog',
      author: [person('Arnold', 'Jan')],
      issued: { 'date-parts': [[2018, 10, 1]] },
      accessed: { 'date-parts': [[2020, 1, 28]] },
      title: 'Biologiedidaktiker:innen, die eierlegenden Wollmilchsäue?',
      URL: 'https://biologiedidaktikerin.com/2018/10/01/selbst-und-fremdverstaendnis-von-biologiedidaktikerinnen/',
    };
    expect(entryOf(blog)).toBe(
      'Arnold, J. (2018, 1. Oktober). *Biologiedidaktiker:innen, die eierlegenden Wollmilchsäue?* Abgerufen am 28. Jänner 2020, von https://biologiedidaktikerin.com/2018/10/01/selbst-und-fremdverstaendnis-von-biologiedidaktikerinnen/',
    );
    const post: Source = {
      id: 'phtirol2024',
      type: 'post',
      author: [{ literal: 'PH Tirol [@phtirol]' }],
      issued: { 'date-parts': [[2024, 2, 10]] },
      title: 'Meilenstein zur Qualitätsentwicklung der öffentlichen Pädagog:innenbildung in Tirol',
      genre: 'Instagram Post',
      'container-title': 'Instagram',
      URL: 'https://www.instagram.com/p/C292qJiM86w/',
    };
    expect(entryOf(post)).toBe(
      'PH Tirol \\[@phtirol\\]. (2024, 10. Februar). *Meilenstein zur Qualitätsentwicklung der öffentlichen Pädagog:innenbildung in Tirol* \\[Instagram Post\\]. Instagram. https://www.instagram.com/p/C292qJiM86w/',
    );
  });

  test('without a year, without an author, with 22 authors, and with initials of several given names', () => {
    expect(entryOf({ id: 'huber', type: 'book', author: [person('Huber', 'Anna')], title: 'Musik' })).toBe('Huber, A. (o. D.). *Musik*.');
    expect(entryOf({ id: 'gehoer2010', type: 'book', issued: { 'date-parts': [[2010]] }, title: 'Gehörbildung', publisher: 'Schott' })).toBe('*Gehörbildung*. (2010). Schott.');
    const many = Array.from({ length: 22 }, (_, index) => person(`A${index + 1}`, 'B'));
    expect(entryOf({ id: 'many', type: 'book', author: many, issued: { 'date-parts': [[2020]] }, title: 'T' })).toBe(`${many.slice(0, 19).map((name) => `${name.family}, B.`).join(', ')}, … A22, B. (2020). *T*.`);
    expect(entryOf({ id: 'names', type: 'book', author: [person('Sartre', 'Jean-Paul'), person('Smith', 'Mary Ann'), person('Lee', 'M. A.')], issued: { 'date-parts': [[2001]] }, title: 'N' })).toBe(
      'Sartre, J.-P., Smith, M. A., & Lee, M. A. (2001). *N*.',
    );
  });
});

describe('the text of a citation in the style of the PHT (R-CITE-002, R-CITE-003)', () => {
  const raggl: Source = { id: 'raggl2015', type: 'book', author: [person('Raggl', 'Andrea')], issued: { 'date-parts': [[2015]] }, title: 'Schule' };
  const two: Source = { id: 'festman2019', type: 'book', author: [person('Festman', 'J.'), person('Schwieter', 'J.')], issued: { 'date-parts': [[2019]] }, title: 'F' };
  const three: Source = { id: 'knitel2019', type: 'book', author: [person('Knitel', 'A.'), person('B', 'B.'), person('C', 'C.')], issued: { 'date-parts': [[2019]] }, title: 'K' };

  test('names one author, two with "&" or "und", three as "et al.", and gives the place with its short German label', () => {
    expect(
      citationsOf(
        [raggl, two, three, { id: 'huber', type: 'book', author: [person('Huber', 'A.')], title: 'Musik' }, { id: 'g', type: 'report', title: 'Gehörbildung', issued: { 'date-parts': [[2010]] } }],
        [
          { id: 'raggl2015', form: 'parenthetical' },
          { id: 'raggl2015', form: 'narrative' },
          { id: 'festman2019', form: 'parenthetical' },
          { id: 'festman2019', form: 'narrative', label: 'page', locator: '341-342' },
          { id: 'knitel2019', form: 'parenthetical', label: 'page', locator: '10' },
          { id: 'knitel2019', form: 'narrative' },
          { id: 'huber', form: 'parenthetical' },
          { id: 'g', form: 'parenthetical' },
          { id: 'raggl2015', form: 'parenthetical', label: 'chapter', locator: '2' },
          { id: 'raggl2015', form: 'parenthetical', label: 'section', locator: '4.1' },
          { id: 'raggl2015', form: 'parenthetical', label: 'figure', locator: '1' },
          { id: 'raggl2015', form: 'parenthetical', label: 'table', locator: '2' },
          { id: 'raggl2015', form: 'parenthetical', label: 'paragraph', locator: '5' },
          { id: 'unknown', form: 'parenthetical' },
        ],
      ),
    ).toEqual([
      'Raggl, 2015',
      'Raggl (2015)',
      'Festman & Schwieter, 2019',
      'Festman und Schwieter (2019, S. 341\u00a0–\u00a0342)',
      'Knitel et al., 2019, S. 10',
      'Knitel et al. (2019)',
      'Huber, o. D.',
      'Gehörbildung, 2010',
      'Raggl, 2015, Kap. 2',
      'Raggl, 2015, Abschn. 4.1',
      'Raggl, 2015, Abb. 1',
      'Raggl, 2015, Tab. 2',
      'Raggl, 2015, Abs. 5',
      '',
    ]);
  });

  test('gives two works of the same authors in one year the letters a and b, in the order of their titles, in the citations and the entries', () => {
    const zeit: Source = { ...raggl, id: 'raggl2015b', title: 'Zeit' };
    const alter: Source = { ...raggl, id: 'raggl2015a', title: 'Alter' };
    const cited = cite(pht, 'de-AT', [zeit, alter, two], [
      { id: 'raggl2015b', form: 'parenthetical' },
      { id: 'festman2019', form: 'parenthetical' },
      { id: 'raggl2015a', form: 'narrative' },
    ]);
    expect(cited.citations).toEqual(['Raggl, 2015b', 'Festman & Schwieter, 2019', 'Raggl (2015a)']);
    expect(cited.entries.map((entry) => entry.id)).toEqual(['festman2019', 'raggl2015a', 'raggl2015b']);
    expect(cited.entries.map((entry) => entry.text)).toEqual(['Festman, J., & Schwieter, J. (2019). *F*.', 'Raggl, A. (2015a). *Alter*.', 'Raggl, A. (2015b). *Zeit*.']);
  });
});

describe('the built-in style apa7 and the CSL locales (R-CITE-003)', () => {
  test('APA 7 of the CSL writes the German terms of the locale, and the English ones in English', () => {
    expect(entryOf({ id: 'huber', type: 'book', author: [person('Huber', 'Anna')], title: 'Musik' }, apa7)).toBe('Huber, A. (o. J.). *Musik*.');
    expect(cite(apa7, 'en-US', [kriesche], [{ id: 'kriesche2019', form: 'narrative', label: 'page', locator: '10-12' }]).citations).toEqual(['Kriesche and Kahlert (2019, pp. 10–12)']);
    expect(cite(apa7, 'de-AT', [kriesche], [{ id: 'kriesche2019', form: 'parenthetical', label: 'chapter', locator: '2' }]).citations).toEqual(['Kriesche & Kahlert, 2019, Kapitel 2']);
  });

  test('a language takes its own locale, else the locale of its first part, else en-US', () => {
    expect([localeOf('de-AT'), localeOf('de-at'), localeOf('de'), localeOf('de-CH'), localeOf('en'), localeOf('en-GB'), localeOf('fr-FR')]).toEqual(['de-AT', 'de-AT', 'de-DE', 'de-DE', 'en-US', 'en-GB', 'en-US']);
    expect(entryOf({ id: 'b', type: 'post-weblog', author: [person('Arnold', 'Jan')], issued: { 'date-parts': [[2018, 1, 1]] }, accessed: { 'date-parts': [[2020, 1, 28]] }, title: 'T', URL: 'https://a.at/x_y' })).toContain(
      'Abgerufen am 28. Jänner 2020, von https://a.at/x_y',
    );
    expect(cite(pht, 'de-DE', [{ id: 'b', type: 'post-weblog', author: [person('Arnold', 'Jan')], issued: { 'date-parts': [[2018, 1, 1]] }, accessed: { 'date-parts': [[2020, 1, 28]] }, title: 'T', URL: 'https://a.at' }], [{ id: 'b', form: 'parenthetical' }]).entries[0].text).toContain('28. Januar 2020');
  });

  test('a file that is no CSL style is an error', () => {
    expect(() => cite({ name: 'bad.csl', xml: '<html></html>' }, 'de-AT', [kriesche], [{ id: 'kriesche2019', form: 'parenthetical' }])).toThrow();
  });
});

describe('the citation style of a layout (R-CITE-003, R-LAY-002)', () => {
  const layout = (citationStyle?: string): Layout => ({
    id: 'pht',
    folder: 'file:///layouts/pht/',
    name: 'PHT',
    language: 'de-AT',
    ...(citationStyle === undefined ? {} : { citationStyle }),
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
  });
  const files: Record<string, string> = { 'file:///layouts/pht/pht-apa7.csl': pht.xml, 'file:///layouts/pht/notes.csl': '<notes/>' };
  const read = async (url: string) => (files[url] === undefined ? undefined : new TextEncoder().encode(files[url]));

  test('is a built-in style, a CSL file of the layout folder, or apa7 when the layout names none', async () => {
    expect(await citationStyleOf(read, layout('apa7'))).toEqual({ style: apa7, problems: [] });
    expect(await citationStyleOf(read, layout('pht-apa7.csl'))).toEqual({ style: pht, problems: [] });
    expect(await citationStyleOf(read, layout())).toEqual({ style: apa7, problems: [] });
  });

  test('is apa7 with a warning when the layout names an unknown style, a missing file, a file outside its folder or no CSL style', async () => {
    for (const [name, message] of [
      ['chicago', 'names the citation style "chicago", which is neither a built-in style (apa7) nor a .csl file of the layout folder'],
      ['missing.csl', 'names the citation style missing.csl, which does not exist'],
      ['../other/pht-apa7.csl', 'neither a built-in style (apa7) nor a .csl file of the layout folder'],
      ['notes.csl', 'The citation style notes.csl of the layout "pht" is no CSL style'],
    ]) {
      const found = await citationStyleOf(read, layout(name));
      expect(found.style).toEqual(apa7);
      expect(found.problems).toEqual([{ severity: 'warning', message: expect.stringContaining(message), file: 'file:///layouts/pht/layout.json' }]);
    }
  });
});
