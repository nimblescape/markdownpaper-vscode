// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the sources, the citations and the reference list (R-CITE-001 to R-CITE-004): the database at the
 * end of the file, the data in the title of a link, the links to a source outside code and comments, the text of each
 * link and the entries that the format step writes in the style of the layout, and the problems.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { addSources, citationProblems, findCitations, findDatabase, parseData, researchEdit, researchMarkers, sourceLine, writeCitations } from './citations';
import type { CitationStyle } from './csl';
import { type Layout, termsFor } from './layout';

/** layout is a German layout of the PHT. */
const layout: Layout = {
  id: 'thesis',
  folder: 'file:///layouts/thesis/',
  name: 'PHT',
  language: 'de-AT',
  citationStyle: 'pht-apa7.csl',
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
};
const style: CitationStyle = { name: 'pht-apa7.csl', xml: fs.readFileSync(path.join(__dirname, '../../test/fixtures/pht-apa7.csl'), 'utf8') };

const hong = '{"id":"hong2024","type":"paper-conference","author":[{"family":"Hong","given":"Sirui"},{"family":"Zhuge","given":"Mingchen"},{"family":"Chen","given":"Jonathan"}],"issued":{"date-parts":[[2024]]},"title":"MetaGPT: Meta programming for a multi-agent collaborative framework"}';
const shao = '{"id":"shao2025","type":"report","author":[{"family":"Shao","given":"Yijia"}],"issued":{"date-parts":[[2025]]},"title":"Future of work with AI agents","publisher":"Stanford University"}';
const raggl = '{"id":"raggl2015","type":"book","author":[{"family":"Raggl","given":"Andrea"}],"issued":{"date-parts":[[2015]]},"title":"Schule"}';

/**
 * file returns the lines of a paper document: its front matter, a text, and the database with the sources.
 * @param text - The lines of the text.
 * @param sources - The lines of the sources.
 */
const file = (text: readonly string[], sources: readonly string[] = [hong, shao, raggl]): string[] => ['---', 'layout: thesis', '---', '', ...text, '', '<!-- nimblescape-sources', ...sources, '-->', ''];

/** at is the line of the first line of the text in a file. */
const at = 4;

const hongEntry = '<a id="hong2024"></a>Hong, S., Zhuge, M., & Chen, J. (2024). *MetaGPT: Meta programming for a multi-agent collaborative framework*.';
const shaoEntry = '<a id="shao2025"></a>Shao, Y. (2025). *Future of work with AI agents*. Stanford University.';

describe('the database of the sources (R-CITE-001)', () => {
  test('reads the sources of the comment, one on each line, and names the lines that it cannot read', () => {
    const lines = [
      '# Title',
      '',
      '```markdown',
      '<!-- nimblescape-sources',
      '```',
      '',
      '<!-- nimblescape-sources',
      '{"id":"hong2024","type":"book","title":"MetaGPT"}',
      '',
      '{"id":"hong2024","title":"Again"}',
      'not json',
      '{"title":"No id"}',
      '["a list"]',
      '{"id":"shao2025","title":"A \\u003e B"}',
      '-->',
    ];
    const database = findDatabase(lines)!;
    expect([database.start, database.end]).toEqual([6, 14]);
    expect(database.sources.map((source) => source.id)).toEqual(['hong2024', 'shao2025']);
    expect(database.sources[1].title).toBe('A > B');
    expect(database.problems.map((problem) => problem.line)).toEqual([9, 10, 11, 12]);
    expect(findDatabase(['Text.'])).toBeUndefined();
  });

  test('names a comment without an end, and a line that ends the comment early', () => {
    expect(findDatabase(['<!-- nimblescape-sources', '{"id":"a"}'])!.problems[0].message).toMatch(/no end/);
    expect(findDatabase(['<!-- nimblescape-sources', '{"id":"a","title":"x-->"}', '-->'])!.problems[0].message).toMatch(/holds "-->"/);
    expect(sourceLine({ id: 'a', title: 'x-->y' })).toBe('{"id":"a","title":"x--\\u003ey"}');
  });
});

describe('new sources in the database (R-CITE-005)', () => {
  const festman = { type: 'article-journal', author: [{ family: 'Festman', given: 'Julia' }], issued: { 'date-parts': [[2019]] }, title: 'Self-Concepts', DOI: '10.3390/bs9040039', id: '' };

  test('makes the database at the end of a file without one, with the ID of decision 22 first', () => {
    const { lines, added, known } = addSources(['# Text', '', 'Words.', ''], [festman]);
    expect(lines).toEqual(['# Text', '', 'Words.', '', '<!-- nimblescape-sources', '{"id":"festman2019","type":"article-journal","author":[{"family":"Festman","given":"Julia"}],"issued":{"date-parts":[[2019]]},"title":"Self-Concepts","DOI":"10.3390/bs9040039"}', '-->', '']);
    expect(added.map((source) => source.id)).toEqual(['festman2019']);
    expect(known).toEqual([]);
    expect(addSources(['Words.'], [festman]).lines.slice(-3)).toEqual(['<!-- nimblescape-sources', expect.stringContaining('festman2019'), '-->']);
  });

  test('adds a source before the end of the database, with a letter for a taken ID, and not a source that it has already', () => {
    const text = ['Words.', '', '<!-- nimblescape-sources', '{"id":"festman2019","title":"Other","issued":{"date-parts":[[2019]]}}', '-->', ''];
    const second = { ...festman, title: 'Second', DOI: '10.1000/second' };
    const { lines, added, known } = addSources(text, [second, { ...festman, DOI: '10.1000/second', title: 'Again' }]);
    expect(added.map((source) => source.id)).toEqual(['festman2019a']);
    expect(known).toEqual([{ source: expect.objectContaining({ title: 'Again' }), id: 'festman2019a', by: 'DOI' }]);
    expect(lines.slice(3)).toEqual([text[3], expect.stringMatching(/^\{"id":"festman2019a",/), '-->', '']);
  });

  test('takes the given ID, and adds nothing for a taken or wrong ID or a database without its end', () => {
    expect(addSources([], [{ ...festman, title: 'BGBl. II Nr. 262/2015' }], 'bgbl-ii-262-2015').added[0].id).toBe('bgbl-ii-262-2015');
    const text = ['<!-- nimblescape-sources', '{"id":"law"}', '-->'];
    expect(addSources(text, [festman], 'law')).toMatchObject({ lines: text, added: [], problem: 'The database has a source with the ID "law" already.' });
    expect(addSources(text, [festman], 'two words').problem).toMatch(/^The ID "two words" is no ID of a source/);
    expect(addSources(['<!-- nimblescape-sources', '{"id":"law"}'], [festman]).problem).toMatch(/no end/);
  });
});

describe('the citations (R-CITE-002)', () => {
  test('have the form "narrative" and a place as a CSL term and its value in the title of the link', () => {
    expect(parseData(undefined)).toEqual({ form: 'parenthetical', unknown: [] });
    expect(parseData('page 3')).toEqual({ form: 'parenthetical', term: 'page', value: '3', unknown: [] });
    expect(parseData('narrative page 13-14')).toEqual({ form: 'narrative', term: 'page', value: '13-14', unknown: [] });
    expect(parseData('chapter 2 narrative')).toEqual({ form: 'narrative', term: 'chapter', value: '2', unknown: [] });
    expect(parseData('S.\u00a03').unknown).toEqual(['S.', '3']);
    expect(parseData('page').unknown).toEqual(['page']);
  });

  test('are the links to a source of the database, not in code, in a comment or in a fenced code block', () => {
    const lines = ['Text ([Hong](#hong2024 "page 3")) and [a heading](#einleitung).', '`[Hong](#hong2024)`', '<!--', '[Hong](#hong2024)', '-->', '```', '[Hong](#hong2024)', '```', '[Shao \\[x\\]](#shao2025)'];
    const citations = findCitations(lines, new Set(['hong2024', 'shao2025']));
    expect(citations.map((citation) => [citation.id, citation.line, citation.data.term])).toEqual([
      ['hong2024', 0, 'page'],
      ['shao2025', 8, undefined],
    ]);
    expect(lines[0].slice(citations[0].textStart, citations[0].textEnd)).toBe('Hong');
  });
});

describe('the format step of the citations (R-CITE-002, R-CITE-004)', () => {
  test('writes the text of each link from the metadata in the style of the layout, and the reference list before the database', () => {
    const lines = file(['# Einleitung', '', 'Agents change teams ([old text](#hong2024 "page 3")). [x](#shao2025 "narrative") describes it; [Hong](#hong2024).']);
    const formatted = writeCitations(lines, layout, style);
    expect(formatted.slice(at, at + 11)).toEqual([
      '# Einleitung',
      '',
      'Agents change teams ([Hong et al., 2024, S.\u00a03](#hong2024 "page 3")). [Shao (2025)](#shao2025 "narrative") describes it; [Hong et al., 2024](#hong2024).',
      '',
      '# Literaturverzeichnis',
      '',
      hongEntry,
      '',
      shaoEntry,
      '',
      '<!-- nimblescape-sources',
    ]);
    expect(writeCitations(formatted, layout, style)).toEqual(formatted);
  });

  test('a comma joins a work of the same author to the citation before it, as APA writes "(Shao, 2025, 2026)"', () => {
    const shao2026 = '{"id":"shao2026","type":"report","author":[{"family":"Shao","given":"Yijia"}],"issued":{"date-parts":[[2026]]},"title":"Agents at work"}';
    const lines = file(['Text ([a](#shao2025), [b](#shao2026 "page 4"); [c](#hong2024)). Two authors ([d](#hong2024), [e](#shao2026)).'], [hong, shao, shao2026]);
    expect(writeCitations(lines, layout, style)[at]).toBe(
      'Text ([Shao, 2025](#shao2025), [2026, S. 4](#shao2026 "page 4"); [Hong et al., 2024](#hong2024)). Two authors ([Hong et al., 2024](#hong2024), [Shao, 2026](#shao2026)).',
    );
  });

  test('puts a new reference list before the appendix part, with the heading of the language of the layout', () => {
    const lines = file(['# Introduction', '', 'Text ([Hong](#hong2024)).', '', '# Appendix', '', '## Guide', '', 'Questions.']);
    const formatted = writeCitations(lines, { ...layout, language: 'en-US', terms: termsFor('en-US') }, style);
    expect(formatted.slice(at + 2, at + 8)).toEqual(['Text ([Hong et al., 2024](#hong2024)).', '', '# Bibliography', '', '<a id="hong2024"></a>Hong, S., Zhuge, M., & Chen, J. (2024). *MetaGPT: Meta programming for a multi-agent collaborative framework*.', '']);
    expect(formatted[at + 8]).toBe('# Appendix');
  });

  test('writes a new reference list as a chapter, also in a file whose chapters are "##", and does not add it again', () => {
    const formatted = writeCitations(file(['## Einleitung', '', 'Text ([Hong](#hong2024)).']), layout, style);
    expect(formatted.slice(at + 3, at + 6)).toEqual(['', '# Literaturverzeichnis', '']);
    expect(writeCitations(formatted, layout, style)).toEqual(formatted);
  });

  test('writes the entries of the cited sources in the order of the style, removes those of sources that the text no longer cites, and keeps other paragraphs', () => {
    const lines = file([
      '# Literaturverzeichnis',
      '',
      '<a id="raggl2015"></a>Raggl, A. (2015). Old text.',
      'with a second line.',
      '',
      'Alle Links wurden am 1. Oktober 2026 abgerufen.',
      '',
      '<a id="hong2024"></a>Hong, wrong.',
      '# Anhang',
      '',
      '[Shao](#shao2025) and ([Hong](#hong2024)).',
    ]);
    const formatted = writeCitations(lines, layout, style);
    expect(formatted.slice(at, at + 10)).toEqual(['# Literaturverzeichnis', '', hongEntry, '', shaoEntry, '', 'Alle Links wurden am 1. Oktober 2026 abgerufen.', '', '# Anhang', '']);
    expect(writeCitations(formatted, layout, style)).toEqual(formatted);
  });

  test('keeps a hint of the template, an alert of GitHub at the start of the reference list, before the entries, without a warning', () => {
    const hint = ['> [!NOTE]', '> Führen Sie hier mind. 5 Werke an'];
    const lines = file(['Text ([Hong](#hong2024)).', '', '# Literaturverzeichnis', '', ...hint, '', '<!-- Ein Kommentar. -->']);
    const formatted = writeCitations(lines, layout, style);
    expect(formatted.slice(at + 2, at + 10)).toEqual(['# Literaturverzeichnis', '', ...hint, '', hongEntry, '', '<!-- Ein Kommentar. -->']);
    expect(writeCitations(formatted, layout, style)).toEqual(formatted);
    expect(citationProblems(formatted, layout)).toEqual([]);
  });

  test('writes the entries only anew in their place in a reference list with a sub-heading or a note', () => {
    const lines = file([
      'Text ([Hong](#hong2024)) and ([Shao](#shao2025)) and [Raggl](#raggl2015).',
      '',
      '# Literatur',
      '',
      '## Bücher',
      '',
      '<a id="raggl2015"></a>Raggl, old.',
      '',
      '## Berichte',
      '',
      '<a id="shao2025"></a>Shao, old.',
      '',
      '<a id="hong2024"></a>Hong, old.<wbr><!--[note-7k2q-->[^note-7k2q]',
    ]);
    const formatted = writeCitations(lines, layout, style);
    expect(formatted.slice(at + 6, at + 13)).toEqual([
      '<a id="raggl2015"></a>Raggl, A. (2015). *Schule*.',
      '',
      '## Berichte',
      '',
      shaoEntry,
      '',
      '<a id="hong2024"></a>Hong, old.<wbr><!--[note-7k2q-->[^note-7k2q]',
    ]);
  });

  test('keeps a citation with words in its title that are no data, and a text without a database', () => {
    const lines = file(['Text ([Hong](#hong2024 "S.\u00a03")).', '', '# Literaturverzeichnis']);
    expect(writeCitations(lines, layout, style)[at]).toBe('Text ([Hong](#hong2024 "S.\u00a03")).');
    expect(writeCitations(lines, layout, style)).toContain(hongEntry);
    expect(writeCitations(['Text ([Hong](#hong2024)).'], layout, style)).toEqual(['Text ([Hong](#hong2024)).']);
  });

  test('gives two works of the same author in one year the letters a and b, also in the citations', () => {
    const second = raggl.replace('raggl2015', 'raggl2015x').replace('"Schule"', '"Alter"');
    const formatted = writeCitations(file(['[R](#raggl2015) and [R](#raggl2015x "narrative").'], [raggl, second]), layout, style);
    expect(formatted[at]).toBe('[Raggl, 2015b](#raggl2015) and [Raggl (2015a)](#raggl2015x "narrative").');
    expect(formatted).toContain('<a id="raggl2015x"></a>Raggl, A. (2015a). *Alter*.');
  });
});

test('the problems name the database, the titles of the citations, the paragraphs of the reference list and each "(RESEARCH)" (R-CITE-001, R-CITE-002)', () => {
  const lines = file(['Text (RESEARCH) and ([Hong](#hong2024 "S.\u00a03")) and ([Shao](#shao2025)).', '', '# Literaturverzeichnis', '', hongEntry, '', 'Huber, A. (2020). Ohne Anker.'], [hong, shao, 'not json']);
  expect(citationProblems(lines, layout).map((problem) => [problem.line! - at, problem.message.slice(0, 30)])).toEqual([
    [0, '"(RESEARCH)" asks an AI agent '],
    [11, 'This line of the sources is no'],
    [0, 'The title of this citation hol'],
    [6, 'This paragraph of the referenc'],
    [0, 'The source "shao2025" has no e'],
  ]);
  expect(citationProblems(['Text.'], layout)).toEqual([]);
});

test('an argument to research ends at its "(RESEARCH)" in its paragraph, and a start marker without one is a warning (R-CITE-002)', () => {
  const problems = (lines: string[]) => citationProblems(lines, layout).map((problem) => [problem.line, problem.message.slice(0, 30)]);
  expect(problems(['<wbr><!--[research-->Feedback changes learning (RESEARCH).'])).toEqual([[0, '"(RESEARCH)" asks an AI agent ']]);
  expect(problems(['<wbr><!--[research-->Feedback changes', 'learning (RESEARCH).'])).toEqual([[1, '"(RESEARCH)" asks an AI agent ']]);
  expect(problems(['<wbr><!--[research-->Feedback changes learning.', '', 'Another paragraph (RESEARCH).'])).toEqual([
    [0, 'The argument to research has n'],
    [2, '"(RESEARCH)" asks an AI agent '],
  ]);
  // A mark in a code span is text.
  expect(problems(['Type `/research`: the argument gets `<wbr><!--[research-->` and `(RESEARCH)`.'])).toEqual([]);
});

test('the start markers of the arguments to research, with the <wbr> before them, are hidden outside code (R-CITE-002, R-GEN-003)', () => {
  const lines = [
    '---',
    'layout: plain',
    '---',
    'Agents <wbr><!--[research-->change the work (RESEARCH). <!--[research-->Teams learn (RESEARCH).',
    'The mark `<wbr><!--[research-->` in code.',
    '```markdown',
    '<wbr><!--[research-->In a code block (RESEARCH).',
    '```',
  ];
  expect(researchMarkers(lines)).toEqual([
    { line: 3, start: 7, end: 28 },
    { line: 3, start: 56, end: 72 },
  ]);
  expect(researchMarkers(['No argument.'])).toEqual([]);
});

test('/research puts the start marker before the selected argument and "(RESEARCH)" before a punctuation mark at its end (R-CITE-002)', () => {
  expect(researchEdit('change the work')).toEqual({ start: 0, end: 15 });
  expect(researchEdit(' Feedback changes learning more than praise does. ')).toEqual({ start: 1, end: 48 });
  expect(researchEdit('Feedback changes\nlearning?')).toEqual({ start: 0, end: 25 });
  expect(researchEdit('  ')).toBe('Select the argument to research, then type /research.');
  expect(researchEdit('.')).toBe('Select the argument to research, then type /research.');
  expect(researchEdit('First argument.\n\nSecond argument.')).toBe('Select an argument in one paragraph.');
  expect(researchEdit('Teams learn (RESEARCH).')).toBe('The selected text has a mark of /research already.');
});
