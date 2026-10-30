// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The sources, the citations and the reference list of a paper document
 * ([R-CITE-001](../../docs/requirements.md#r-cite-001) to [R-CITE-004](../../docs/requirements.md#r-cite-004)).
 *
 * The database of the sources is one HTML comment at the end of the file, with the metadata of each source in CSL
 * JSON on one line. A citation is a link to the entry of its source, and the title of the link holds the data of the
 * citation as CSL terms, which do not depend on the style: "narrative" and the place in the source.
 *
 * ```markdown
 * Agents change the work of teams ([Hong et al., 2024, S. 3](#hong2024 "page 3")).
 * [Hong et al. (2024)](#hong2024 "narrative") describe three ways.
 *
 * # Literaturverzeichnis
 *
 * <a id="hong2024"></a>Hong, S., Zhuge, M., … (2024). *MetaGPT* …
 *
 * <!-- nimblescape-sources
 * {"id":"hong2024","type":"paper-conference","author":[{"family":"Hong","given":"Sirui"}],"issued":{"date-parts":[[2024]]},"title":"MetaGPT"}
 * -->
 * ```
 *
 * The format step writes the text of each citation and the entries of the cited sources in the citation style of the
 * layout ([csl.ts](csl.ts)). It changes only text whose edges the markup marks: the text of a link `[…](#id)` whose id
 * is a source of the database, and a paragraph of the reference list that starts with the anchor of a source. The
 * module uses no API of VS Code.
 */

import { type CitationStyle, cite, type Form, type Source } from './csl';
import { bodyOf, readFrontMatter } from './frontMatter';
import type { Layout, Problem } from './layout';
import { type Heading, renderBody } from './markdown';
import { sameSource, sourceId } from './metadata';

/** sourcesName is the name of the comment of the database in its first line. */
export const sourcesName = 'nimblescape-sources';

/** sourcesStart matches the first line of the comment of the database. */
const sourcesStart = new RegExp(`^<!--\\s*${sourcesName}\\s*$`);

/** idPattern matches the identifier of a source: a letter or a digit, then letters, digits, `_`, `-`, `.` and `:`. */
export const idPattern = /^[\p{L}\p{N}][\p{L}\p{N}_.:-]*$/u;

/** fence matches the line that opens or closes a fenced code block, with its fence. */
const fence = /^ {0,3}(`{3,}|~{3,})/;

/** SourceProblem is a line of the database that the step cannot read, with the reason. */
export interface SourceProblem {
  line: number;
  message: string;
}

/** Database is the comment of the database in the lines of a text: its first and its last line, its sources and its problems. */
export interface Database {
  start: number;
  end: number;
  /** sources are the sources in the order of the lines, each identifier once. */
  sources: Source[];
  problems: SourceProblem[];
}

/**
 * findDatabase returns the comment of the database of a text: the first comment whose first line is
 * `<!-- nimblescape-sources`, outside the fenced code blocks; undefined without one. Each line between the first and
 * the last line is one source as a JSON object with an identifier; an empty line is allowed.
 * @param lines - The lines of the text.
 */
export function findDatabase(lines: readonly string[]): Database | undefined {
  let open: string | undefined;
  const start = lines.findIndex((line) => {
    const mark = fence.exec(line)?.[1];
    if (mark && (open === undefined || (mark[0] === open[0] && mark.length >= open.length))) {
      open = open === undefined ? mark : undefined;
      return false;
    }
    return open === undefined && sourcesStart.test(line.trimEnd());
  });
  if (start < 0) {
    return undefined;
  }
  let end = start + 1;
  while (end < lines.length && !lines[end].includes('-->')) {
    end++;
  }
  const database: Database = { start, end: Math.min(end, lines.length - 1), sources: [], problems: [] };
  if (end >= lines.length) {
    database.problems.push({ line: start, message: 'The comment of the sources has no end: add a line with "-->" after the last source.' });
  } else if (lines[end].trim() !== '-->') {
    database.problems.push({ line: end, message: 'A source line holds "-->", which ends the comment of the sources. Write ">" in a text of a source as "\\u003e".' });
  }
  const ids = new Set<string>();
  for (let line = start + 1; line < Math.min(end, lines.length); line++) {
    const text = lines[line].trim();
    if (text === '') {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      database.problems.push({ line, message: 'This line of the sources is no JSON object. Each line holds the metadata of one source in CSL JSON, on one line.' });
      continue;
    }
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string' || !idPattern.test(id)) {
      database.problems.push({ line, message: 'This source has no valid "id": give it an identifier of letters and digits, for example "hong2024".' });
    } else if (ids.has(id)) {
      database.problems.push({ line, message: `Another source of the file has the id "${id}". Give this source an id of its own.` });
    } else {
      database.sources.push(value as Source);
      ids.add(id);
    }
  }
  return database;
}

/**
 * sourceLine returns the line of the database of a source: its metadata as one line of JSON, with each ">" written as
 * ">", so that no line holds "-->".
 * @param source - The source.
 */
export const sourceLine = (source: Source): string => JSON.stringify(source).replace(/>/g, '\\u003e');

/** Added is the result of addSources: the new lines of the text, the new sources, the sources that the database has already, and why it added none. */
export interface Added {
  lines: string[];
  added: Source[];
  known: { source: Source; id: string; by: string }[];
  problem?: string;
}

/**
 * addSources adds new sources to the database of a text, each with the ID first: before the end of the comment, or in
 * a new comment at the end of the text. A source gets the given ID, else its ID by decision 22 (sourceId); a source
 * whose DOI, ISBN, or title and year the database has already is not added again.
 * @param lines - The lines of the text.
 * @param sources - The new sources.
 * @param newId - The ID of the one new source, if the call gives it.
 */
export function addSources(lines: readonly string[], sources: readonly Source[], newId?: string): Added {
  const database = findDatabase(lines);
  if (database && (database.end >= lines.length || lines[database.end].trim() !== '-->')) {
    return { lines: [...lines], added: [], known: [], problem: database.problems[0]?.message ?? 'The comment of the sources has no end.' };
  }
  if (newId !== undefined && !idPattern.test(newId)) {
    return { lines: [...lines], added: [], known: [], problem: `The ID "${newId}" is no ID of a source: letters and digits, then also "_", "-", "." and ":".` };
  }
  const present = [...(database?.sources ?? [])];
  const taken = new Set(present.map((source) => source.id));
  // An ID in a line that the checks report, such as a second source with the same ID, is taken as well.
  for (let line = (database?.start ?? 0) + 1; database && line < database.end; line++) {
    const id = /"id"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(lines[line])?.[1];
    if (id !== undefined) {
      taken.add(id);
    }
  }
  const added: Source[] = [];
  const known: Added['known'] = [];
  for (const source of sources) {
    const same = sameSource(source, present);
    if (same) {
      known.push({ source, id: same.source.id, by: same.by });
      continue;
    }
    const { id: _id, ...fields } = source;
    const id = newId ?? sourceId(source, taken);
    if (taken.has(id)) {
      return { lines: [...lines], added: [], known: [], problem: `The database has a source with the ID "${id}" already.` };
    }
    const entry = { id, ...fields } as Source;
    added.push(entry);
    present.push(entry);
    taken.add(id);
  }
  const entries = added.map(sourceLine);
  if (entries.length === 0) {
    return { lines: [...lines], added, known };
  }
  if (database) {
    return { lines: [...lines.slice(0, database.end), ...entries, ...lines.slice(database.end)], added, known };
  }
  const body = [...lines];
  const ending = body.length > 0 && body[body.length - 1] === '';
  while (body.length > 0 && body[body.length - 1].trim() === '') {
    body.pop();
  }
  return { lines: [...body, ...(body.length > 0 ? [''] : []), `<!-- ${sourcesName}`, ...entries, '-->', ...(ending || body.length === 0 ? [''] : [])], added, known };
}

/** locatorTerms are the CSL terms of a place in a source, which the title of a citation names. */
export const locatorTerms: readonly string[] = [
  'appendix',
  'article-locator',
  'book',
  'canon',
  'chapter',
  'column',
  'elocation',
  'equation',
  'figure',
  'folio',
  'issue',
  'line',
  'note',
  'opus',
  'page',
  'paragraph',
  'part',
  'rule',
  'scene',
  'section',
  'sub-verbo',
  'supplement',
  'table',
  'timestamp',
  'title-locator',
  'verse',
  'volume',
];

/** CitationData is the data of a citation in the title of its link: its form, the place in the source, and the words that are no data. */
export interface CitationData {
  form: Form;
  /** term is the CSL term of the place in the source, for example page, and value its value, for example 13-14. */
  term?: string;
  value?: string;
  /** unknown are the words of the title that are no data of a citation. */
  unknown: string[];
}

/**
 * parseData returns the data of a citation from the title of its link: "narrative" before or after a place, a CSL term
 * and its value, for example "narrative page 13-14".
 * @param title - The title of the link, or undefined without one.
 */
export function parseData(title: string | undefined): CitationData {
  const words = (title ?? '').trim().split(/\s+/).filter(Boolean);
  const data: CitationData = { form: 'parenthetical', unknown: [] };
  if (words[0] === 'narrative') {
    data.form = 'narrative';
    words.shift();
  } else if (words.length > 1 && words[words.length - 1] === 'narrative') {
    data.form = 'narrative';
    words.pop();
  }
  if (words.length > 1 && locatorTerms.includes(words[0])) {
    data.term = words[0];
    data.value = words.slice(1).join(' ');
  } else {
    data.unknown = words;
  }
  return data;
}

/** Citation is a link to a source in the text: the source, the place of the link and of its text, and its data. */
export interface Citation {
  id: string;
  line: number;
  /** start and end are the columns of the link, and textStart and textEnd those of its text between the brackets. */
  start: number;
  end: number;
  textStart: number;
  textEnd: number;
  data: CitationData;
}

/** linkSearch matches a link to a place of the page, with its text, its target and its title in double quotes. */
const linkSearch = /\[((?:\\.|[^\\[\]\n])*)\]\(#([^\s()"<>]+)(?:[ \t]+"((?:\\.|[^"\\\n])*)")?[ \t]*\)/g;

/** targetSearch matches the target of a link to a place of the page, also of a link whose text holds the markup of a note. */
const targetSearch = /\]\(#([^\s()"<>]+)/g;

/** codeSearch matches the code spans of a line, in which a link is text. */
const codeSearch = /(`+)[^]*?(?<!`)\1(?!`)/g;

/** anchorStart matches the anchor of an entry at the start of its line, with the identifier of its source. */
const anchorStart = /^<a id="([^"]+)"><\/a>/;

/** noteMarkup matches the markup of a note of Markdown Notes: its start marker or its reference. */
const noteMarkup = /<!--\[note-[a-z0-9]{4}|\[\^note-[a-z0-9]{4}\]/;

/** headingLine matches an ATX heading. */
const headingLine = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/** hintStart matches the first line of an alert of GitHub, such as `> [!NOTE]`, for example the hint of a template. */
const hintStart = /^ {0,3}>[ \t]?\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

/** commentStart matches the first line of an HTML comment, which the pages do not show. */
const commentStart = /^ {0,3}<!--/;

/**
 * researchText asks an AI agent for the evidence of the argument from the start marker `researchMark` to it, or of the
 * sentence before it without a start marker ([R-CITE-002](../../docs/requirements.md#r-cite-002)).
 */
export const researchText = '(RESEARCH)';
export const researchMark = '<!--[research-->';

/** researchSearch matches a start marker of an argument to research, with the `<wbr>` before it. */
const researchSearch = /(?:<wbr>)?<!--\[research-->/g;

/** closingMark matches the punctuation mark at the end of a selected argument, before which its citation goes. */
const closingMark = /[.,;:!?]$/;

/** Marker is a part of a line: the index of the line, and the start and the end of the part in it. */
export interface Marker {
  line: number;
  start: number;
  end: number;
}

/** ResearchEdit is the place of the start marker and of `(RESEARCH)` in a selected argument, as offsets in its text. */
export interface ResearchEdit {
  start: number;
  end: number;
}
/**
 * textLines returns the indexes of the lines of a text that hold Markdown text: not the front matter, a fenced code
 * block or a comment of HTML that starts at the start of a line, such as the database.
 * @param lines - The lines of the text.
 */
function textLines(lines: readonly string[]): number[] {
  const found: number[] = [];
  let open: string | undefined;
  let comment = false;
  const frontMatter = readFrontMatter(lines.join('\n'));
  for (let line = frontMatter ? frontMatter.end + 1 : 0; line < lines.length; line++) {
    const text = lines[line];
    const mark = fence.exec(text)?.[1];
    if (!comment && mark && (open === undefined || (mark[0] === open[0] && mark.length >= open.length))) {
      open = open === undefined ? mark : undefined;
      continue;
    }
    if (open !== undefined) {
      continue;
    }
    if (comment) {
      comment = !text.includes('-->');
      continue;
    }
    if (/^ {0,3}<!--/.test(text) && !text.includes('-->', text.indexOf('<!--') + 4)) {
      comment = true;
      continue;
    }
    found.push(line);
  }
  return found;
}

/**
 * codeSpans returns the columns of the code spans of a line, in which a link is text.
 * @param text - The text of the line.
 */
const codeSpans = (text: string): [number, number][] => [...text.matchAll(codeSearch)].map((match) => [match.index, match.index + match[0].length]);

/**
 * researchMarkers returns the start markers of the arguments to research in a text, each with the `<wbr>` before it,
 * outside code, which the clean editing view of Markdown Notes leaves out
 * ([R-GEN-003](../../docs/requirements.md#r-gen-003)).
 * @param lines - The lines of the text.
 */
export function researchMarkers(lines: readonly string[]): Marker[] {
  const markers: Marker[] = [];
  for (const line of textLines(lines)) {
    const text = lines[line];
    if (!text.includes(researchMark)) {
      continue;
    }
    const code = codeSpans(text);
    for (const match of text.matchAll(researchSearch)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!code.some(([a, b]) => a < end && start < b)) {
        markers.push({ line, start, end });
      }
    }
  }
  return markers;
}

/**
 * researchEdit returns where `/research` puts the start marker and `(RESEARCH)` in a selected argument
 * ([R-CITE-002](../../docs/requirements.md#r-cite-002)): the marker before its first character, and `(RESEARCH)` after
 * its last word, before a punctuation mark at its end, where the citation goes. It returns the reason as a text when
 * the selection is no argument: no text, more than one paragraph, or a mark of `/research` in it.
 * @param selected - The selected text.
 */
export function researchEdit(selected: string): ResearchEdit | string {
  const start = selected.length - selected.trimStart().length;
  let argument = selected.slice(start).trimEnd();
  if (argument === '') {
    return 'Select the argument to research, then type /research.';
  }
  if (/\n[ \t]*\r?\n/.test(argument)) {
    return 'Select an argument in one paragraph.';
  }
  if (argument.includes(researchMark) || argument.includes(researchText)) {
    return 'The selected text has a mark of /research already.';
  }
  if (closingMark.test(argument)) {
    argument = argument.slice(0, -1).trimEnd();
  }
  return argument === '' ? 'Select the argument to research, then type /research.' : { start, end: start + argument.length };
}

/**
 * findCitations returns the citations of a text: the links to a place of the page whose target is a source of the
 * database, outside code.
 * @param lines - The lines of the text.
 * @param ids - The identifiers of the sources.
 */
export function findCitations(lines: readonly string[], ids: ReadonlySet<string>): Citation[] {
  const citations: Citation[] = [];
  for (const line of textLines(lines)) {
    const text = lines[line];
    if (!text.includes('](#')) {
      continue;
    }
    const code = codeSpans(text);
    for (const match of text.matchAll(linkSearch)) {
      const start = match.index;
      const end = start + match[0].length;
      if (ids.has(match[2]) && !code.some(([a, b]) => a < end && start < b)) {
        citations.push({ id: match[2], line, start, end, textStart: start + 1, textEnd: start + 1 + match[1].length, data: parseData(match[3]) });
      }
    }
  }
  return citations;
}

/**
 * citedIds returns the identifiers of the sources that a text cites, in the order of the text: the targets of the
 * links to a place of the page that are sources of the database, outside code, also of a link whose text holds the
 * markup of a note and so is no citation that the step writes.
 * @param lines - The lines of the text.
 * @param ids - The identifiers of the sources.
 * @param skip - Tells whether to skip a line, for example of the reference list.
 */
function citedIds(lines: readonly string[], ids: ReadonlySet<string>, skip: (line: number) => boolean): string[] {
  const found = new Set<string>();
  for (const line of textLines(lines)) {
    const text = lines[line];
    if (skip(line) || !text.includes('](#')) {
      continue;
    }
    const code = codeSpans(text);
    for (const match of text.matchAll(targetSearch)) {
      if (ids.has(match[1]) && !code.some(([a, b]) => a <= match.index && match.index < b)) {
        found.add(match[1]);
      }
    }
  }
  return [...found];
}

/** Section is the reference list of a text: the line of its heading, its level, and the line after it. */
interface Section {
  heading: number;
  level: number;
  end: number;
}

/**
 * sectionsOf returns the reference list of a text, the special section `BIB` that the renderer finds by the words of
 * the layout or by its marker, and the heading of the appendix part.
 * @param lines - The lines of the text.
 * @param layout - The layout.
 * @param database - The database, whose comment ends the reference list.
 */
function sectionsOf(lines: readonly string[], layout: Layout, database: Database): { bibliography?: Section; appendix?: Heading } {
  const text = lines.join('\n');
  const headings = renderBody(bodyOf(text, readFrontMatter(text)), layout).headings;
  const found = headings.find((heading) => heading.section === 'BIB');
  const appendix = headings.find((heading) => heading.section === 'APX');
  if (!found) {
    return appendix ? { appendix } : {};
  }
  const next = headings.find((heading) => heading.line > found.line && heading.level <= found.level)?.line;
  const ends = [next, database.start > found.line ? database.start : undefined, lines.length].filter((line): line is number => line !== undefined);
  return { bibliography: { heading: found.line, level: found.level, end: Math.min(...ends) }, ...(appendix ? { appendix } : {}) };
}

/**
 * isBlank tells whether a line is blank.
 * @param line - The line, or undefined.
 */
const isBlank = (line: string | undefined): boolean => line === undefined || line.trim() === '';

/**
 * paragraphsOf returns the paragraphs of lines: the index of the first line of each and the index after its last
 * line, without the blank lines between them.
 * @param lines - The lines.
 */
const paragraphsOf = (lines: readonly string[]): [number, number][] => {
  const paragraphs: [number, number][] = [];
  for (let line = 0; line < lines.length; line++) {
    if (!isBlank(lines[line]) && isBlank(lines[line - 1])) {
      let end = line + 1;
      while (end < lines.length && !isBlank(lines[end])) {
        end++;
      }
      paragraphs.push([line, end]);
    }
  }
  return paragraphs;
};

/**
 * writeCitations returns the lines of a paper document with the text of each citation and the entries of the reference
 * list written from the database of the sources in the citation style of the layout. The reference list holds an
 * entry for each cited source, in the order of the style, and after them its other paragraphs as they are. Without
 * the section and with citations, the section comes before the appendix part, else before the database, with the
 * heading of the language of the layout. In a section with a sub-heading or a note, the step only writes each entry
 * anew in its place, and leaves an entry with a note as it is. A citation whose title holds words that are no data
 * stays as it is, and so does a text without a database.
 * @param lines - The lines of the text.
 * @param layout - The layout, with the language of the document.
 * @param style - The citation style of the layout.
 */
export function writeCitations(lines: readonly string[], layout: Layout, style: CitationStyle): string[] {
  const database = findDatabase(lines);
  if (!database || database.sources.length === 0) {
    return [...lines];
  }
  const sources = new Map(database.sources.map((source) => [source.id, source]));
  const ids = new Set(sources.keys());
  const { bibliography, appendix } = sectionsOf(lines, layout, database);
  const inSection = (line: number): boolean => bibliography !== undefined && line > bibliography.heading && line < bibliography.end;
  const cited = citedIds(lines, ids, inSection);
  const citations = findCitations(lines, ids).filter((citation) => !inSection(citation.line) && citation.data.unknown.length === 0);
  const written = cite(
    style,
    layout.language,
    database.sources,
    citations.map((citation) => ({ id: citation.id, form: citation.data.form, ...(citation.data.term && citation.data.value ? { label: citation.data.term, locator: citation.data.value } : {}) })),
    cited,
  );
  const output = [...lines];
  // From the last citation to the first, so that the columns of the citations before stay where they are.
  for (let index = citations.length - 1; index >= 0; index--) {
    const citation = citations[index];
    const text = written.citations[index];
    if (text !== '') {
      const line = output[citation.line];
      output[citation.line] = line.slice(0, citation.textStart) + text + line.slice(citation.textEnd);
    }
  }
  const entries = new Map(written.entries.map((entry) => [entry.id, `<a id="${entry.id}"></a>${entry.text}`]));
  const ordered = written.entries.map((entry) => entries.get(entry.id)!);
  if (!bibliography) {
    if (ordered.length === 0) {
      return output;
    }
    // The reference list is a chapter (`#`), as the renderer finds it only there (R-REN-004).
    const section = [`# ${layout.terms.sections.BIB[0]}`, '', ...ordered.flatMap((entry, index) => (index === 0 ? [entry] : ['', entry])), ''];
    const at = appendix ? appendix.line : database.start;
    output.splice(at, 0, ...(at > 0 && !isBlank(output[at - 1]) ? ['', ...section] : section));
    return output;
  }
  const first = bibliography.heading + 1;
  const body = output.slice(first, bibliography.end);
  const paragraphs = paragraphsOf(body).map(([start, end]) => ({ lines: body.slice(start, end), start, end, id: anchorStart.exec(body[start])?.[1] }));
  if (body.some((line) => noteMarkup.test(line) || headingLine.test(line))) {
    for (const paragraph of paragraphs.reverse()) {
      const entry = paragraph.id === undefined ? undefined : entries.get(paragraph.id);
      if (entry && !paragraph.lines.some((line) => noteMarkup.test(line))) {
        output.splice(first + paragraph.start, paragraph.end - paragraph.start, entry);
      }
    }
    return output;
  }
  if (ordered.length === 0 && body.every(isBlank)) {
    return output;
  }
  // A hint at the start of the reference list, such as the hint of a template, stays before the entries.
  const firstOther = paragraphs.findIndex((paragraph) => !hintStart.test(paragraph.lines[0]));
  const hints = firstOther < 0 ? paragraphs : paragraphs.slice(0, firstOther);
  const others = paragraphs.slice(hints.length).filter((paragraph) => paragraph.id === undefined || !sources.has(paragraph.id));
  const blocks = [...hints.map((paragraph) => paragraph.lines), ...ordered.map((entry) => [entry]), ...others.map((paragraph) => paragraph.lines)];
  const section = ['', ...blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block]))];
  if (blocks.length > 0 && (bibliography.end < output.length || isBlank(body[body.length - 1]))) {
    section.push('');
  }
  output.splice(first, bibliography.end - first, ...section);
  return output;
}

/**
 * citationProblems returns the problems of the citations of a paper document: the lines of the database that the step
 * cannot read, a title of a citation with words that are no data, a paragraph of the reference list that is no entry
 * of a source, a cited source without an entry, each "(RESEARCH)", which asks an AI agent for the evidence of an
 * argument, and a start marker of an argument without its "(RESEARCH)".
 * @param lines - The lines of the text.
 * @param layout - The layout of the document.
 */
export function citationProblems(lines: readonly string[], layout: Layout): Problem[] {
  const problems: Problem[] = [];
  const at = (line: number, column = 0, end = lines[line]?.length ?? 0) => ({ line, column, length: Math.max(end - column, 0) });
  const text = new Set(textLines(lines));
  for (const line of text) {
    // A mark in a code span is text, for example in an explanation of /research.
    const code = codeSpans(lines[line]);
    const inCode = (column: number) => code.some(([a, b]) => a <= column && column < b);
    for (let column = lines[line].indexOf(researchText); column >= 0; column = lines[line].indexOf(researchText, column + 1)) {
      if (inCode(column)) {
        continue;
      }
      problems.push({
        severity: 'warning',
        message: '"(RESEARCH)" asks an AI agent to find sources that support the argument before it, to add them to the sources, and to cite them here.',
        ...at(line, column, column + researchText.length),
      });
    }
    // The argument of a start marker ends at a "(RESEARCH)" in the same paragraph.
    for (let column = lines[line].indexOf(researchMark); column >= 0; column = lines[line].indexOf(researchMark, column + 1)) {
      if (inCode(column)) {
        continue;
      }
      let end = line;
      let rest = lines[line].slice(column + researchMark.length);
      while (!rest.includes(researchText) && text.has(end + 1) && lines[end + 1].trim() !== '') {
        end++;
        rest = lines[end];
      }
      if (!rest.includes(researchText)) {
        problems.push({ severity: 'warning', message: 'The argument to research has no "(RESEARCH)" at its end in its paragraph.', ...at(line, column, column + researchMark.length) });
      }
    }
  }
  const database = findDatabase(lines);
  if (!database) {
    return problems;
  }
  for (const problem of database.problems) {
    problems.push({ severity: 'warning', message: problem.message, ...at(problem.line) });
  }
  const sources = new Set(database.sources.map((source) => source.id));
  const citations = findCitations(lines, sources);
  for (const citation of citations) {
    if (citation.data.unknown.length > 0) {
      problems.push({
        severity: 'warning',
        message: `The title of this citation holds "${citation.data.unknown.join(' ')}", which is no data of a citation. The title holds "narrative" and a place, for example "page 3" or "chapter 2".`,
        ...at(citation.line, citation.start, citation.end),
      });
    }
  }
  const { bibliography } = sectionsOf(lines, layout, database);
  const entries = new Set<string>();
  if (bibliography) {
    const first = bibliography.heading + 1;
    for (const [start] of paragraphsOf(lines.slice(first, bibliography.end))) {
      const line = first + start;
      const id = anchorStart.exec(lines[line])?.[1];
      if (id !== undefined && sources.has(id)) {
        entries.add(id);
      } else if (!headingLine.test(lines[line]) && !hintStart.test(lines[line]) && !commentStart.test(lines[line])) {
        problems.push({
          severity: 'warning',
          message: `This paragraph of the reference list is no entry of a source of the file. Add its source to the comment "${sourcesName}" and cite it; the format then writes its entry.`,
          ...at(line),
        });
      }
    }
  }
  const inSection = (line: number): boolean => bibliography !== undefined && line > bibliography.heading && line < bibliography.end;
  const missing = new Set(citedIds(lines, sources, inSection).filter((id) => !entries.has(id)));
  for (const citation of citations) {
    if (missing.delete(citation.id)) {
      problems.push({
        severity: 'warning',
        message: `The source "${citation.id}" has no entry in the reference list yet. Format the document, and the format writes it.`,
        ...at(citation.line, citation.start, citation.end),
      });
    }
  }
  return problems;
}
