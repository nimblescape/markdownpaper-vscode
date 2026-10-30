// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The metadata of new sources ([R-CITE-005](../../docs/requirements.md#r-cite-005)): Markdown Paper fills the metadata
 * of a source in the ways that Zotero does, so that an AI agent never writes metadata from memory. This module reads
 * what the lookups and the files give and turns it into CSL JSON:
 *
 * - the CSL JSON of doi.org and of PubMed, with the types and the field names of Crossref;
 * - the records of library catalogs in MARC 21 (the German National Library, K10plus) and of Open Library;
 * - the exports of databases and of reference managers: RIS, BibTeX and CSL JSON;
 * - the metadata that a web page holds: the tags `citation_*` of Google Scholar, Dublin Core, JSON-LD of schema.org,
 *   else its title as a web page;
 * - the DOI in the metadata of a PDF file.
 *
 * It also finds the identifier in an input, gives a new source its ID by the rules of decision 22, finds a source
 * that the database has already, and names the fields that a source of its type needs. The module uses no API of VS
 * Code and no network; lookup.ts asks the services.
 */

import { inflateSync, constants as zlibConstants } from 'zlib';
import type { Name, Source } from './csl';

/** Found is what a reader found in an input: its sources, and the identifiers that it did not use, such as the DOIs of a page. */
export interface Found {
  sources: Source[];
  candidates: string[];
}

/** doiSearch matches a DOI in a text. */
const doiSearch = /\b(10\.\d{4,9}\/[^\s"'<>]+[^\s"'<>.,;)\]])/g;

/** arxivSearch matches an identifier of arXiv after "arXiv:" in a text. */
const arxivSearch = /arXiv:\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/g;

/**
 * cleanDoi returns a DOI without the address of doi.org and in small letters, as a DOI is the same in any case.
 * @param text - A DOI, also as an address of doi.org.
 */
export const cleanDoi = (text: string): string => text.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').toLowerCase();

/**
 * cleanIsbn returns the digits of an ISBN, with an X at its end.
 * @param text - An ISBN with hyphens or spaces.
 */
export const cleanIsbn = (text: string): string => text.replace(/[^0-9Xx]/g, '').toUpperCase();

/**
 * isIsbn tells whether a text of digits is an ISBN with 10 or 13 digits and the right check digit.
 * @param isbn - The digits, from cleanIsbn.
 */
export function isIsbn(isbn: string): boolean {
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

/**
 * isbn13 returns the ISBN with 13 digits of an ISBN, so that the two forms of one book compare equal.
 * @param isbn - The digits of an ISBN, from cleanIsbn.
 */
export function isbn13(isbn: string): string {
  if (isbn.length !== 10) {
    return isbn;
  }
  const digits = `978${isbn.slice(0, 9)}`;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${digits}${(10 - (sum % 10)) % 10}`;
}

/**
 * nameOf returns the name of a person from a text: "Family, Given" or "Given Family"; a name in braces or with only
 * one word stays as one literal name, as for an organization.
 * @param text - The name.
 */
export function nameOf(text: string): Name {
  const name = text.replace(/\s+/g, ' ').trim();
  if (/^\{.*\}$/.test(name)) {
    return { literal: name.slice(1, -1).trim() };
  }
  const comma = name.indexOf(',');
  if (comma > 0) {
    const given = name.slice(comma + 1).trim();
    return given ? { family: name.slice(0, comma).trim(), given } : { literal: name.slice(0, comma).trim() };
  }
  const words = name.split(' ');
  return words.length > 1 ? { family: words[words.length - 1], given: words.slice(0, -1).join(' ') } : { literal: name };
}

/**
 * dateOf returns a date in CSL JSON from a text such as 2019, 2019-04, 2019/04/01 or 2019-04-01T10:00:00Z.
 * @param text - The date.
 */
export function dateOf(text: string): Source['issued'] | undefined {
  const match = /(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/.exec(text);
  if (!match) {
    return undefined;
  }
  const parts = [Number(match[1]), ...(match[2] ? [Number(match[2])] : []), ...(match[3] && match[2] ? [Number(match[3])] : [])].filter((part) => part > 0);
  return { 'date-parts': [parts] };
}

/**
 * dayOf returns a day as a date in CSL JSON, for the day of the access of a web page.
 * @param day - The day.
 */
export const dayOf = (day: Date): Source['issued'] => ({ 'date-parts': [[day.getFullYear(), day.getMonth() + 1, day.getDate()]] });

/**
 * pagesOf returns the pages of a source from its first and its last page.
 * @param first - The first page.
 * @param last - The last page, if any.
 */
const pagesOf = (first: string | undefined, last: string | undefined): string | undefined => (first ? (last && last !== first ? `${first}-${last}` : first) : undefined);

/**
 * withoutEmpty returns a source without the fields that have no value; the ID stays, also when it is empty.
 * @param source - The source.
 */
const withoutEmpty = (source: Record<string, unknown>): Source =>
  Object.fromEntries(Object.entries(source).filter(([key, value]) => key === 'id' || (value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)))) as unknown as Source;

/**
 * decodeEntities returns a text of HTML or XML with its entities as characters.
 * @param text - The text.
 */
const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * cleanText returns a text of metadata with its entities as characters, without the markup of JATS and HTML but the
 * italic, bold, superscript and subscript parts that citeproc-js reads, and with single spaces.
 * @param text - The text.
 */
export const cleanText = (text: string): string =>
  decodeEntities(text.replace(/<\/?(?!(?:i|b|sup|sub)>)[a-z][\w:-]*(?:\s[^<>]*)?>/gi, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** cslTypes are the types of CSL 1.0.2. */
const cslTypes = new Set([
  'article',
  'article-journal',
  'article-magazine',
  'article-newspaper',
  'bill',
  'book',
  'broadcast',
  'chapter',
  'classic',
  'collection',
  'dataset',
  'document',
  'entry',
  'entry-dictionary',
  'entry-encyclopedia',
  'event',
  'figure',
  'graphic',
  'hearing',
  'interview',
  'legal_case',
  'legislation',
  'manuscript',
  'map',
  'motion_picture',
  'musical_score',
  'pamphlet',
  'paper-conference',
  'patent',
  'performance',
  'periodical',
  'personal_communication',
  'post',
  'post-weblog',
  'regulation',
  'report',
  'review',
  'review-book',
  'software',
  'song',
  'speech',
  'standard',
  'thesis',
  'treaty',
  'webpage',
]);

/** crossrefTypes are the CSL types of the types of Crossref, which doi.org gives for a DOI of Crossref. */
const crossrefTypes: Record<string, string> = {
  'journal-article': 'article-journal',
  'proceedings-article': 'paper-conference',
  'book-chapter': 'chapter',
  'book-section': 'chapter',
  'book-part': 'chapter',
  'book-track': 'chapter',
  book: 'book',
  monograph: 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  'book-set': 'book',
  'book-series': 'book',
  proceedings: 'book',
  report: 'report',
  'report-series': 'report',
  'report-component': 'report',
  dissertation: 'thesis',
  'posted-content': 'article',
  dataset: 'dataset',
  database: 'dataset',
  standard: 'standard',
  'standard-series': 'standard',
  'reference-entry': 'entry-encyclopedia',
  'peer-review': 'review',
  journal: 'periodical',
  'journal-issue': 'periodical',
  'journal-volume': 'periodical',
};

/**
 * cslTypeOf returns the CSL type of a type of CSL or of Crossref; another type is a document.
 * @param type - The type.
 */
const cslTypeOf = (type: unknown): string => (typeof type !== 'string' ? 'document' : cslTypes.has(type) ? type : (crossrefTypes[type] ?? 'document'));

/**
 * The fields of CSL JSON that describe a source, in the order of a line of the database; a source keeps no other
 * field, so not the list of its references or the dates of a registry, which doi.org gives too.
 */
const cslFields = [
  'id',
  'type',
  'author',
  'editor',
  'translator',
  'container-author',
  'collection-editor',
  'issued',
  'accessed',
  'event-date',
  'original-date',
  'title',
  'title-short',
  'container-title',
  'container-title-short',
  'collection-title',
  'collection-number',
  'volume',
  'number-of-volumes',
  'issue',
  'page',
  'number',
  'edition',
  'publisher',
  'publisher-place',
  'event-title',
  'event-place',
  'genre',
  'medium',
  'status',
  'version',
  'ISBN',
  'ISSN',
  'DOI',
  'PMID',
  'PMCID',
  'URL',
  'language',
  'authority',
  'chapter-number',
  'section',
] as const;

/** nameFields are the fields of CSL JSON with a list of names. */
const nameFields = new Set(['author', 'editor', 'translator', 'container-author', 'collection-editor']);

/** dateFields are the fields of CSL JSON with a date. */
const dateFields = new Set(['issued', 'accessed', 'event-date', 'original-date']);

/**
 * cleanName returns a name of CSL JSON with only the parts of a name; a name with only a given name, as JaLC gives an
 * organization, is a literal name.
 * @param value - The name.
 */
function cleanName(value: unknown): Name | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const item = value as Record<string, unknown>;
  const name: Name = {};
  for (const part of ['family', 'given', 'non-dropping-particle', 'dropping-particle', 'suffix', 'literal'] as const) {
    if (typeof item[part] === 'string' && (item[part] as string).trim()) {
      name[part] = cleanText(item[part] as string);
    }
  }
  if (!name.family && !name.literal) {
    const literal = name.given ?? (typeof item.name === 'string' ? cleanText(item.name) : undefined);
    return literal ? { literal } : undefined;
  }
  return name;
}

/**
 * cleanDate returns a date of CSL JSON with numbers in its parts.
 * @param value - The date.
 */
function cleanDate(value: unknown): Source['issued'] | undefined {
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'string' ? dateOf(value) : undefined;
  }
  const item = value as Record<string, unknown>;
  const parts = Array.isArray(item['date-parts'])
    ? (item['date-parts'] as unknown[]).filter(Array.isArray).map((range) => (range as unknown[]).map(Number).filter((part) => Number.isInteger(part) && part > 0))
    : [];
  if (parts.length > 0 && parts[0].length > 0) {
    return { 'date-parts': parts.filter((range) => range.length > 0) };
  }
  for (const key of ['literal', 'raw'] as const) {
    if (typeof item[key] === 'string' && item[key]) {
      return { [key]: item[key] as string };
    }
  }
  return undefined;
}

/**
 * editionOf returns the edition of a source as CSL reads it: the number of a counted edition, such as "2" for "2nd
 * ed." or "2. Auflage", nothing for the first edition, else the text.
 * @param text - The edition.
 */
export function editionOf(text: string): string | undefined {
  const value = text.trim();
  const counted = /^(\d+)\s*(?:\.|st|nd|rd|th)?\s*(?:ed\.?|edition|aufl\.?|auflage|ausg\.?|ausgabe)?\.?$/i.exec(value);
  if (counted) {
    return counted[1] === '1' ? undefined : counted[1];
  }
  return value || undefined;
}

/**
 * keepFields returns a source with only the fields of CSL JSON that describe it, in the order of a line of the
 * database: the types and the field names of Crossref become those of CSL, a title gets its subtitle after ": ", a
 * first edition goes, and a source with a DOI keeps no address. The ID of the input stays.
 * @param input - The metadata, as doi.org, PubMed or a file of CSL JSON give it.
 */
export function keepFields(input: Record<string, unknown>): Source {
  const item: Record<string, unknown> = { ...input };
  // Crossref names some fields of CSL JSON in its own way.
  item['publisher-place'] ??= item['publisher-location'];
  item['event-title'] ??= typeof item.event === 'string' ? item.event : undefined;
  item.edition ??= item['edition-number'];
  const kept: Record<string, unknown> = {};
  for (const key of cslFields) {
    const value = item[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (nameFields.has(key)) {
      kept[key] = Array.isArray(value) ? value.map(cleanName).filter((name) => name !== undefined) : undefined;
    } else if (dateFields.has(key)) {
      kept[key] = cleanDate(value);
    } else {
      // doi.org gives some texts as lists; CSL JSON has one text.
      const text = Array.isArray(value) ? value.map(String)[0] : typeof value === 'number' ? String(value) : value;
      if (typeof text === 'string') {
        kept[key] = key === 'DOI' || key === 'URL' || key === 'id' ? text.trim() : cleanText(text);
      }
    }
  }
  const subtitle = [item.subtitle].flat().find((value): value is string => typeof value === 'string' && value.trim() !== '');
  if (typeof kept.title === 'string' && subtitle && !kept.title.includes(cleanText(subtitle))) {
    kept.title = `${kept.title}: ${cleanText(subtitle)}`;
  }
  kept.type = cslTypeOf(kept.type);
  kept.edition = typeof kept.edition === 'string' ? editionOf(kept.edition) : undefined;
  if (typeof kept.DOI === 'string') {
    kept.DOI = cleanDoi(kept.DOI);
    kept.URL = undefined;
  }
  kept.id = typeof input.id === 'string' ? input.id : '';
  return withoutEmpty(kept);
}

/**
 * readCslJson returns the sources of CSL JSON, the export of Zotero and of doi.org: one source or a list of them.
 * @param text - The JSON.
 */
export function readCslJson(text: string): Source[] {
  const value: unknown = JSON.parse(text);
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)).map(keepFields);
}

/** risTypes are the CSL types of the types of RIS. */
const risTypes: Record<string, string> = {
  JOUR: 'article-journal',
  EJOUR: 'article-journal',
  MGZN: 'article-magazine',
  NEWS: 'article-newspaper',
  BOOK: 'book',
  EBOOK: 'book',
  EDBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  CONF: 'paper-conference',
  CPAPER: 'paper-conference',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  WEB: 'webpage',
  BLOG: 'post-weblog',
  DATA: 'dataset',
  COMP: 'software',
  STAT: 'legislation',
  BILL: 'bill',
  CASE: 'legal_case',
  PAT: 'patent',
  STAND: 'standard',
  GEN: 'document',
};

/**
 * readRis returns the sources of an export in RIS, the format of most databases and of EndNote.
 * @param text - The text of the export.
 */
export function readRis(text: string): Source[] {
  const sources: Source[] = [];
  let fields: [string, string][] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9])  -(?: (.*))?$/.exec(line);
    if (!match) {
      continue;
    }
    const [, tag, value = ''] = match;
    if (tag === 'TY') {
      fields = [[tag, value.trim()]];
    } else if (tag === 'ER') {
      sources.push(risSource(fields));
      fields = [];
    } else {
      fields.push([tag, value.trim()]);
    }
  }
  return sources;
}

/**
 * risSource returns the source of the fields of one record of RIS.
 * @param fields - The tags and their values, in their order.
 */
function risSource(fields: readonly [string, string][]): Source {
  const all = (...tags: string[]) => fields.filter(([tag]) => tags.includes(tag)).map(([, value]) => value).filter(Boolean);
  const one = (...tags: string[]) => all(...tags)[0];
  const type = risTypes[one('TY') ?? ''] ?? 'document';
  const isbn = all('SN').find((value) => cleanIsbn(value).length >= 10);
  const doi = one('DO') ?? all('UR', 'L3').map((url) => /doi\.org\/(.+)$/.exec(url)?.[1]).find(Boolean);
  const container = type === 'chapter' || type === 'paper-conference' ? one('T2', 'BT', 'T3') : one('T2', 'JF', 'JO', 'JA', 'J2');
  return keepFields({
    type,
    author: all('AU', 'A1').map(nameOf),
    editor: type === 'article-journal' ? [] : all('A2', 'ED', ...(type === 'chapter' ? [] : ['A3'])).map(nameOf),
    issued: dateOf(one('PY', 'Y1', 'DA') ?? ''),
    title: one('TI', 'T1', 'CT') ?? (type === 'book' ? one('BT') : undefined),
    'container-title': container,
    volume: one('VL'),
    issue: one('IS'),
    page: pagesOf(one('SP'), one('EP')),
    edition: one('ET'),
    publisher: one('PB'),
    'publisher-place': one('CY'),
    genre: type === 'thesis' ? one('M3') : undefined,
    ISBN: isbn,
    ISSN: type === 'article-journal' ? all('SN').find((value) => cleanIsbn(value).length === 8) : undefined,
    DOI: doi,
    URL: one('UR'),
    language: one('LA'),
  });
}

/** latexAccents are the LaTeX accents of BibTeX and their letters. */
const latexAccents: Record<string, Record<string, string>> = {
  '"': { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü', e: 'ë', i: 'ï' },
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', E: 'É', c: 'ć', n: 'ń', s: 'ś', z: 'ź' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '~': { n: 'ñ', a: 'ã', o: 'õ' },
  c: { c: 'ç', C: 'Ç' },
  v: { c: 'č', s: 'š', z: 'ž', C: 'Č', S: 'Š', Z: 'Ž', r: 'ř', e: 'ě' },
};

/**
 * latexText returns the text of a value of BibTeX: the letters of its LaTeX accents, without its braces and
 * commands, with "--" as an en dash.
 * @param text - The value.
 */
export function latexText(text: string): string {
  return text
    .replace(/\{?\\([`'^"~]|[cv](?=[\s{]))\s*\{?([A-Za-z])\}?\}?/g, (whole, accent: string, letter: string) => latexAccents[accent]?.[letter] ?? whole)
    .replace(/\{?\\ss\}?/g, 'ß')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

/** bibtexTypes are the CSL types of the types of BibTeX and BibLaTeX. */
const bibtexTypes: Record<string, string> = {
  article: 'article-journal',
  book: 'book',
  booklet: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  proceedings: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  report: 'report',
  manual: 'report',
  online: 'webpage',
  www: 'webpage',
  misc: 'document',
  unpublished: 'manuscript',
  dataset: 'dataset',
  software: 'software',
};

/** BibtexEntry is one entry of BibTeX: its type, its key and its fields. */
interface BibtexEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/**
 * bibtexEntries returns the entries of a text of BibTeX, without the entries @comment, @string and @preamble.
 * @param text - The text.
 */
function bibtexEntries(text: string): BibtexEntry[] {
  const entries: BibtexEntry[] = [];
  const start = /@(\w+)\s*[{(]\s*([^,\s]*)\s*,/g;
  for (let match = start.exec(text); match; match = start.exec(text)) {
    const type = match[1].toLowerCase();
    if (type === 'comment' || type === 'string' || type === 'preamble') {
      continue;
    }
    const fields: Record<string, string> = {};
    let at = start.lastIndex;
    for (;;) {
      const name = /\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/y;
      name.lastIndex = at;
      const found = name.exec(text);
      if (!found) {
        break;
      }
      at = name.lastIndex;
      let value: string;
      if (text[at] === '{') {
        let depth = 0;
        const begin = at;
        for (; at < text.length; at++) {
          depth += text[at] === '{' ? 1 : text[at] === '}' ? -1 : 0;
          if (depth === 0) {
            break;
          }
        }
        value = text.slice(begin + 1, at);
        at++;
      } else if (text[at] === '"') {
        const end = text.indexOf('"', at + 1);
        value = text.slice(at + 1, end < 0 ? text.length : end);
        at = end < 0 ? text.length : end + 1;
      } else {
        const bare = /[^,}\s]*/y;
        bare.lastIndex = at;
        value = bare.exec(text)?.[0] ?? '';
        at = bare.lastIndex;
      }
      fields[found[1].toLowerCase()] = value;
    }
    start.lastIndex = at;
    entries.push({ type, key: match[2], fields });
  }
  return entries;
}

/**
 * monthOf returns the number of a month of BibTeX, such as apr or 4.
 * @param month - The month, if any.
 */
function monthOf(month: string | undefined): string | undefined {
  if (!month) {
    return undefined;
  }
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month.slice(0, 3).toLowerCase());
  return index >= 0 ? String(index + 1) : /^\d{1,2}$/.test(month) ? month : undefined;
}

/**
 * braced tells whether one pair of braces holds a whole text, as BibTeX writes the name of an organization, also with
 * braces of accents inside: `{Deutsches Institut f{\"u}r Normung}`.
 * @param text - The text.
 */
function braced(text: string): boolean {
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return false;
  }
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    depth += text[index] === '{' ? 1 : text[index] === '}' ? -1 : 0;
    if (depth === 0 && index < text.length - 1) {
      return false;
    }
  }
  return depth === 0;
}

/**
 * readBibtex returns the sources of a text of BibTeX or BibLaTeX, the format of Google Scholar and of LaTeX.
 * @param text - The text.
 */
export function readBibtex(text: string): Source[] {
  return bibtexEntries(text).map(({ type, fields }) => {
    const value = (...names: string[]): string | undefined => {
      const found = names.map((name) => fields[name]).find((field) => field !== undefined && field.trim() !== '');
      return found === undefined ? undefined : latexText(found);
    };
    const names = (name: string): Name[] => (fields[name] ? fields[name].split(/\s+and\s+/).map((one) => (braced(one.trim()) ? { literal: latexText(one) } : nameOf(latexText(one)))) : []);
    const cslType = bibtexTypes[type] ?? 'document';
    const year = value('year');
    return keepFields({
      type: cslType,
      author: names('author'),
      editor: names('editor'),
      issued: dateOf(value('date') ?? (year ? [year, monthOf(value('month'))].filter(Boolean).join('-') : '')),
      title: value('title'),
      'container-title': value('journal', 'journaltitle', 'booktitle'),
      volume: value('volume'),
      issue: value('number', 'issue'),
      page: value('pages')?.replace(/\s*[–-]+\s*/g, '-'),
      edition: value('edition'),
      publisher: value('publisher', 'institution', 'school', 'organization'),
      'publisher-place': value('address', 'location'),
      genre: cslType === 'thesis' ? (value('type') ?? (type === 'phdthesis' ? 'Dissertation' : type === 'mastersthesis' ? 'Masterarbeit' : undefined)) : undefined,
      ISBN: value('isbn'),
      ISSN: value('issn'),
      DOI: value('doi'),
      URL: value('url'),
      accessed: value('urldate') ? dateOf(value('urldate')!) : undefined,
      language: value('language', 'langid'),
    });
  });
}

/**
 * attributesOf returns the attributes of an HTML or XML tag.
 * @param tag - The tag.
 */
const attributesOf = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((match) => [match[1].toLowerCase(), decodeEntities(match[3] ?? match[4] ?? match[5] ?? '')]));

/**
 * pageAddress returns the address of a saved page: its canonical link, its og:url, or the comment
 * "saved from url=" that browsers write into a saved page.
 * @param html - The HTML of the page.
 */
function pageAddress(html: string): string | undefined {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesOf(match[0]);
    if (attributes.rel?.toLowerCase() === 'canonical' && /^https?:\/\//.test(attributes.href ?? '')) {
      return attributes.href;
    }
  }
  return /<!--\s*saved from url=\(\d+\)(https?:\/\/[^\s>]+)\s*-->/i.exec(html)?.[1];
}

/**
 * readHtml returns the source that a web page describes: by the tags `citation_*` of Google Scholar, which most
 * publishers and repositories write, else by Dublin Core, else by JSON-LD of schema.org, else as a web page with its
 * title, its author, its date and the day of the access. A page that is no work of its own gives its DOIs as
 * candidates, as they can name the works that it cites.
 * @param html - The HTML of the page.
 * @param url - The address of the page, if known; else the page names it.
 * @param today - The day of the access.
 */
export function readHtml(html: string, url: string | undefined, today: Date): Found {
  const meta: [string, string][] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = attributesOf(match[0]);
    const name = (attributes.name ?? attributes.property ?? '').toLowerCase();
    if (name && attributes.content !== undefined && attributes.content.trim() !== '') {
      meta.push([name, attributes.content.trim()]);
    }
  }
  const all = (...names: string[]) => meta.filter(([name]) => names.includes(name)).map(([, value]) => value);
  const one = (...names: string[]) => all(...names)[0];
  const address = url ?? one('og:url') ?? pageAddress(html);
  const highwire = one('citation_title');
  if (highwire) {
    const arxiv = one('citation_arxiv_id');
    const doi = one('citation_doi', 'dc.identifier.doi') ?? (arxiv ? `10.48550/arXiv.${arxiv}` : undefined);
    const container = one('citation_journal_title');
    const conference = one('citation_conference_title');
    const book = one('citation_book_title', 'citation_inbook_title');
    const thesis = one('citation_dissertation_institution');
    const report = one('citation_technical_report_institution');
    const type = container ? 'article-journal' : conference ? 'paper-conference' : book ? 'chapter' : thesis ? 'thesis' : report ? 'report' : one('citation_isbn') ? 'book' : 'article';
    const source = keepFields({
      type,
      author: all('citation_author').map(nameOf),
      editor: all('citation_editor').map(nameOf),
      issued: dateOf(one('citation_publication_date', 'citation_date', 'citation_cover_date', 'citation_online_date', 'citation_year') ?? ''),
      title: highwire,
      'container-title': container ?? conference ?? book,
      'container-title-short': one('citation_journal_abbrev'),
      volume: one('citation_volume'),
      issue: one('citation_issue'),
      page: pagesOf(one('citation_firstpage'), one('citation_lastpage')),
      number: one('citation_technical_report_number'),
      publisher: one('citation_publisher') ?? thesis ?? report ?? (arxiv ? 'arXiv' : undefined),
      ISBN: one('citation_isbn'),
      ISSN: type === 'article-journal' ? one('citation_issn') : undefined,
      DOI: doi,
      URL: one('citation_abstract_html_url', 'citation_public_url') ?? address,
      language: one('citation_language'),
    });
    return { sources: [source], candidates: [] };
  }
  const dublin = one('dc.title', 'dcterms.title');
  if (dublin) {
    const identifier = all('dc.identifier', 'dcterms.identifier').find((value) => /10\.\d{4,9}\//.test(value));
    const source = keepFields({
      type: one('dc.type')?.toLowerCase().includes('book') ? 'book' : 'document',
      author: all('dc.creator', 'dcterms.creator').map(nameOf),
      issued: dateOf(one('dc.date', 'dcterms.issued', 'dcterms.date', 'dcterms.created') ?? ''),
      title: dublin,
      publisher: one('dc.publisher', 'dcterms.publisher'),
      DOI: identifier?.replace(/^.*?(10\.\d{4,9}\/)/, '$1'),
      URL: address,
      language: one('dc.language', 'dcterms.language'),
    });
    return { sources: [source], candidates: [] };
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const items = (Array.isArray(data) ? data : [data]).flatMap((item) => (item && typeof item === 'object' && Array.isArray((item as { '@graph'?: unknown[] })['@graph']) ? (item as { '@graph': unknown[] })['@graph'] : [item]));
    const work = items.find((item) => {
      const type = (item as { '@type'?: unknown } | null)?.['@type'];
      return [type].flat().some((name) => typeof name === 'string' && /^(ScholarlyArticle|Article|NewsArticle|BlogPosting|Book|Chapter|Report|Thesis)$/.test(name));
    }) as Record<string, unknown> | undefined;
    if (work) {
      const source = jsonLdSource(work, address);
      return { sources: [source.type === 'post-weblog' && !source.DOI ? { ...source, accessed: dayOf(today) } : source], candidates: [] };
    }
  }
  const candidates = [...new Set([...html.matchAll(doiSearch)].map((found) => cleanDoi(found[1])))];
  const title = one('og:title', 'twitter:title') ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!title || !cleanText(title)) {
    return { sources: [], candidates };
  }
  const source = keepFields({
    type: 'webpage',
    author: all('author', 'article:author')
      .filter((name) => !/^https?:\/\//.test(name))
      .map(nameOf),
    issued: dateOf(one('article:published_time', 'date', 'dcterms.created') ?? ''),
    accessed: dayOf(today),
    title,
    'container-title': one('og:site_name'),
    URL: address,
    language: attributesOf(/<html\b[^>]*>/i.exec(html)?.[0] ?? '').lang,
  });
  return { sources: [source], candidates };
}

/**
 * jsonLdSource returns the source of a work of schema.org in JSON-LD.
 * @param work - The work.
 * @param url - The address of the page.
 */
function jsonLdSource(work: Record<string, unknown>, url: string | undefined): Source {
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string' ? (value as { name: string }).name : undefined;
  const person = (value: unknown): Name | undefined => {
    if (typeof value === 'string') {
      return nameOf(value);
    }
    if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>;
      if (typeof item.familyName === 'string') {
        return { family: item.familyName, ...(typeof item.givenName === 'string' ? { given: item.givenName } : {}) };
      }
      if (typeof item.name === 'string') {
        return item['@type'] === 'Organization' ? { literal: item.name } : nameOf(item.name);
      }
    }
    return undefined;
  };
  const type = [work['@type']].flat()[0];
  const identifier = [work.identifier, work.sameAs, work['@id']]
    .flat()
    .map((value) => (typeof value === 'string' ? value : text(value)))
    .find((value) => value && /10\.\d{4,9}\//.test(value));
  return keepFields({
    type:
      type === 'Book' ? 'book' : type === 'Chapter' ? 'chapter' : type === 'Report' ? 'report' : type === 'Thesis' ? 'thesis' : type === 'BlogPosting' ? 'post-weblog' : type === 'NewsArticle' ? 'article-newspaper' : 'article-journal',
    author: [work.author].flat().map(person).filter((name): name is Name => name !== undefined),
    issued: dateOf(String(work.datePublished ?? work.dateCreated ?? '')),
    title: text(work.headline) ?? text(work.name),
    'container-title': text(work.isPartOf),
    publisher: text(work.publisher),
    ISBN: typeof work.isbn === 'string' ? work.isbn : undefined,
    DOI: identifier?.replace(/^.*?(10\.\d{4,9}\/)/, '$1'),
    URL: typeof work.url === 'string' ? work.url : url,
    language: typeof work.inLanguage === 'string' ? work.inLanguage : undefined,
  });
}

/** MarcField is a data field of a MARC 21 record: its tag, its indicators and its subfields. */
interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: [string, string][];
}

/** MarcRecord is a record of MARC 21: its leader, its control fields and its data fields. */
interface MarcRecord {
  leader: string;
  control: Map<string, string>;
  fields: MarcField[];
}

/**
 * marcRecords returns the records of MARC 21 in XML (MARCXML), in the answer of a catalog to a search (SRU) or in a
 * file. A record starts with its leader.
 * @param xml - The XML.
 */
function marcRecords(xml: string): MarcRecord[] {
  const leaders = [...xml.matchAll(/<(?:[\w-]+:)?leader\b[^>]*>([^<]*)<\/(?:[\w-]+:)?leader>/g)];
  return leaders.map((leader, index) => {
    const part = xml.slice(leader.index, leaders[index + 1]?.index ?? xml.length);
    const control = new Map([...part.matchAll(/<(?:[\w-]+:)?controlfield\b([^>]*)>([^<]*)<\/(?:[\w-]+:)?controlfield>/g)].map((match) => [attributesOf(match[1]).tag ?? '', decodeEntities(match[2])]));
    const fields = [...part.matchAll(/<(?:[\w-]+:)?datafield\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?datafield>/g)].map((match) => {
      const attributes = attributesOf(match[1]);
      const subfields = [...match[2].matchAll(/<(?:[\w-]+:)?subfield\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?subfield>/g)].map((sub): [string, string] => [attributesOf(sub[1]).code ?? '', decodeEntities(sub[2])]);
      return { tag: attributes.tag ?? '', ind1: attributes.ind1 ?? ' ', ind2: attributes.ind2 ?? ' ', subfields };
    });
    return { leader: leader[1], control, fields };
  });
}

/** marcLanguages are the language tags of the language codes of MARC 21. */
const marcLanguages: Record<string, string> = {
  ger: 'de',
  eng: 'en',
  fre: 'fr',
  ita: 'it',
  spa: 'es',
  por: 'pt',
  dut: 'nl',
  lat: 'la',
  rus: 'ru',
  pol: 'pl',
  cze: 'cs',
  hun: 'hu',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  tur: 'tr',
  gre: 'el',
  jpn: 'ja',
  chi: 'zh',
};

/**
 * isbd returns a value of a MARC record without the punctuation of the catalog (ISBD) at its end, without the marks
 * of the words that a catalog does not sort by (`¬Die¬`, `<<Die>>`, `Die @Schule`), and without brackets around it.
 * @param text - The value.
 */
const isbd = (text: string): string =>
  cleanText(text.replace(/¬|<<|>>/g, '').replace(/(^|\s)@(?=\S)/g, '$1'))
    .replace(/\s*[/:;,=]$/, '')
    .replace(/\s+([:;])\s+/g, '$1 ')
    .replace(/^\[(.*)\]$/, '$1')
    .trim();

/**
 * marcSource returns the source of a MARC 21 record of a library catalog, as Zotero reads it.
 * @param record - The record.
 */
function marcSource(record: MarcRecord): Source {
  const fields = (...tags: string[]) => record.fields.filter((field) => tags.includes(field.tag));
  const values = (field: MarcField | undefined, code: string) => (field ? field.subfields.filter(([sub]) => sub === code).map(([, value]) => value) : []);
  const value = (field: MarcField | undefined, code: string) => values(field, code)[0];
  const roleOf = (field: MarcField): 'author' | 'editor' | 'translator' | 'none' | 'other' => {
    const codes = values(field, '4');
    const words = values(field, 'e').join(' ').toLowerCase();
    if (codes.includes('edt') || /herausgeber|hrsg|editor/.test(words)) {
      return 'editor';
    }
    if (codes.includes('aut') || /verfasser|autor|author/.test(words)) {
      return 'author';
    }
    if (codes.includes('trl') || /übersetzer|translator/.test(words)) {
      return 'translator';
    }
    return codes.length === 0 && words === '' ? 'none' : 'other';
  };
  const people = { author: [] as Name[], editor: [] as Name[], translator: [] as Name[] };
  for (const field of fields('100', '110', '700', '710')) {
    const name = value(field, 'a');
    let role = roleOf(field);
    if (!name || role === 'other' || (role === 'none' && field.tag !== '100' && field.tag !== '110')) {
      continue;
    }
    role = role === 'none' ? 'author' : role;
    people[role].push(field.tag.endsWith('10') ? { literal: isbd(name) } : nameOf(isbd(name)));
  }
  const title = fields('245')[0];
  const parts = [value(title, 'a'), ...values(title, 'n'), ...values(title, 'p')].filter(Boolean).map((part) => isbd(part!));
  const subtitle = value(title, 'b');
  const published = fields('264').find((field) => field.ind2 === '1') ?? fields('260')[0];
  const copyright = fields('264').find((field) => field.ind2 === '4');
  const date = value(published, 'c') ?? value(copyright, 'c') ?? record.control.get('008')?.slice(7, 11);
  const thesis = fields('502')[0];
  const host = fields('773')[0];
  const series = fields('490')[0];
  const doi = fields('024').find((field) => values(field, '2').some((scheme) => scheme.toLowerCase() === 'doi'));
  const isbns = fields('020').flatMap((field) => values(field, 'a').map((isbn) => /[\dXx-]{10,17}/.exec(isbn)?.[0] ?? isbn));
  const language = value(fields('041')[0], 'a') ?? record.control.get('008')?.slice(35, 38);
  const level = record.leader[7];
  const type = thesis ? 'thesis' : level === 'a' && host ? (values(host, 'x').length > 0 ? 'article-journal' : 'chapter') : level === 's' ? 'periodical' : 'book';
  const thesisParts = (value(thesis, 'a') ?? '').split(',').map((part) => part.trim());
  return keepFields({
    type,
    author: people.author,
    editor: people.editor,
    translator: people.translator,
    issued: dateOf(date ?? ''),
    title: [parts.join('. '), subtitle ? isbd(subtitle) : undefined].filter(Boolean).join(': '),
    'container-title': host ? isbd(value(host, 't') ?? '') : undefined,
    page: host ? /(\d+)\s*[-–]\s*(\d+)/.exec(value(host, 'g') ?? '')?.slice(1).join('-') : undefined,
    'collection-title': series ? isbd(value(series, 'a') ?? '') : undefined,
    'collection-number': series ? (/\d+/.exec(value(series, 'v') ?? '')?.[0] ?? value(series, 'v')) : undefined,
    edition: value(fields('250')[0], 'a'),
    publisher: type === 'thesis' ? (value(thesis, 'c') ?? thesisParts[1] ?? value(published, 'b')) : value(published, 'b') ? isbd(value(published, 'b')!) : undefined,
    'publisher-place': value(published, 'a') ? isbd(value(published, 'a')!) : undefined,
    genre: type === 'thesis' ? (value(thesis, 'b') ?? thesisParts[0]) : undefined,
    ISBN: isbns.join(' '),
    DOI: value(doi, 'a'),
    language: language ? marcLanguages[language] : undefined,
  });
}

/**
 * readMarcXml returns the sources of the records of MARC 21 in XML; with an ISBN, the record of that ISBN comes first
 * and keeps only that ISBN, as a catalog also finds the other forms of a book by its ISBN.
 * @param xml - The XML.
 * @param isbn - The ISBN that the catalog was asked for, if any.
 */
export function readMarcXml(xml: string, isbn?: string): Source[] {
  const sources = marcRecords(xml).map(marcSource);
  if (!isbn) {
    return sources.map((source) => withoutEmpty({ ...source, ISBN: typeof source.ISBN === 'string' ? source.ISBN.split(' ')[0] : undefined }));
  }
  const wanted = isbn13(cleanIsbn(isbn));
  const holds = (source: Source) => typeof source.ISBN === 'string' && source.ISBN.split(' ').some((one) => isbn13(cleanIsbn(one)) === wanted);
  // The record of the ISBN keeps the ISBN in the form that it was asked for, which a record can also list in the
  // other form.
  return [...sources.filter(holds), ...sources.filter((source) => !holds(source))].map((source) =>
    withoutEmpty({ ...source, ISBN: holds(source) ? cleanIsbn(isbn) : (source.ISBN as string | undefined)?.split(' ')[0] }),
  );
}

/**
 * readOpenLibrary returns the source of the answer of Open Library to a search by an ISBN (`api/books`, `jscmd=data`).
 * @param json - The answer.
 * @param isbn - The ISBN.
 */
export function readOpenLibrary(json: string, isbn: string): Source[] {
  const data = JSON.parse(json) as Record<string, Record<string, unknown>>;
  const record = data[`ISBN:${isbn}`] ?? Object.values(data)[0];
  if (!record) {
    return [];
  }
  const names = (list: unknown): string[] => (Array.isArray(list) ? list.map((item) => (item as { name?: unknown })?.name).filter((name): name is string => typeof name === 'string') : []);
  return [
    keepFields({
      type: 'book',
      author: names(record.authors).map(nameOf),
      issued: dateOf(typeof record.publish_date === 'string' ? record.publish_date : ''),
      title: record.title,
      subtitle: record.subtitle,
      publisher: names(record.publishers)[0],
      'publisher-place': names(record.publish_places)[0],
      ISBN: isbn,
    }),
  ];
}

/**
 * arxivPublished returns the DOI of the published version of a paper that the answer of the arXiv API names.
 * @param xml - The answer of `export.arxiv.org/api/query`.
 */
export const arxivPublished = (xml: string): string | undefined => {
  const doi = /<arxiv:doi\b[^>]*>([^<]+)<\/arxiv:doi>/.exec(xml)?.[1];
  return doi ? cleanDoi(decodeEntities(doi)) : undefined;
};

/** Candidate is a work that a search of Crossref found: its DOI and what tells it apart. */
export interface Candidate {
  doi: string;
  authors: string;
  year?: number;
  title: string;
  container?: string;
  type: string;
}

/**
 * readCrossrefSearch returns the works of the answer of Crossref to a search (`api.crossref.org/works`).
 * @param json - The answer.
 */
export function readCrossrefSearch(json: string): Candidate[] {
  const items = ((JSON.parse(json) as { message?: { items?: unknown[] } }).message?.items ?? []) as Record<string, unknown>[];
  return items
    .filter((item) => typeof item.DOI === 'string')
    .map((item) => {
      const authors = (Array.isArray(item.author) ? item.author : []).map(cleanName).filter((name) => name !== undefined);
      const year = cleanDate(item.issued)?.['date-parts']?.[0]?.[0];
      const container = [item['container-title']].flat().find((value): value is string => typeof value === 'string');
      return {
        doi: cleanDoi(item.DOI as string),
        authors: authors.length === 0 ? '' : `${authors[0].family ?? authors[0].literal}${authors.length > 2 ? ' et al.' : authors.length === 2 ? ` & ${authors[1].family ?? authors[1].literal}` : ''}`,
        ...(typeof year === 'number' ? { year } : {}),
        title: cleanText([item.title].flat().find((value): value is string => typeof value === 'string') ?? ''),
        ...(container ? { container: cleanText(container) } : {}),
        type: cslTypeOf(item.type),
      };
    });
}

/**
 * pdfIdentifiers returns the identifiers in a PDF file: the DOIs of its metadata (the XMP packet with `prism:doi`,
 * `pdfx:doi`, `crossmark:DOI` or `dc:identifier`, and the document info), which name the paper itself, and the DOIs
 * and arXiv IDs elsewhere in the file, in its links and its text, which can also be the references of the paper.
 * Compressed streams are read too.
 * @param bytes - The file.
 */
export function pdfIdentifiers(bytes: Uint8Array): { metadata: string[]; other: string[] } {
  const raw = Buffer.from(bytes).toString('latin1');
  const texts = [raw];
  const streamStart = /stream\r?\n/g;
  for (let match = streamStart.exec(raw); match; match = streamStart.exec(raw)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) {
      break;
    }
    const dictionary = raw.slice(Math.max(0, raw.lastIndexOf(' obj', match.index)), match.index);
    if (/\/FlateDecode/.test(dictionary) && !/\/Subtype\s*\/Image|\/FontFile|\/Length1\b/.test(dictionary)) {
      try {
        texts.push(inflateSync(Buffer.from(raw.slice(start, end), 'latin1'), { finishFlush: zlibConstants.Z_SYNC_FLUSH }).toString('latin1'));
      } catch {
        // A stream that is not compressed as its dictionary says has no identifiers to read.
      }
    }
    streamStart.lastIndex = end;
  }
  const metadata = new Set<string>();
  const metaSearch = /(?:prism:doi|pdfx:doi|crossmark:doi|dc:identifier|prism:url)(?:>|\s*=\s*["'])\s*(?:<rdf:\w+>\s*)*(?:<rdf:li\b[^>]*>\s*)?(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s"'<>]+)/gi;
  const infoSearch = /\/(?:doi|DOI|Subject|Keywords)\s*\(([^)]*)\)/g;
  for (const text of texts) {
    for (const match of text.matchAll(metaSearch)) {
      metadata.add(cleanDoi(match[1]));
    }
    for (const match of text.matchAll(infoSearch)) {
      for (const doi of match[1].matchAll(doiSearch)) {
        metadata.add(cleanDoi(doi[1]));
      }
    }
  }
  const other = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(doiSearch)) {
      const doi = cleanDoi(match[1].replace(/\\\)$/, ''));
      if (!metadata.has(doi)) {
        other.add(doi);
      }
    }
    for (const match of text.matchAll(arxivSearch)) {
      other.add(`arXiv:${match[1]}`);
    }
  }
  return { metadata: [...metadata], other: [...other].slice(0, 20) };
}

/** Identifier is an identifier of a source in an input: a DOI, an ISBN, a PubMed ID, an arXiv ID or a web address. */
export interface Identifier {
  kind: 'doi' | 'isbn' | 'pmid' | 'arxiv' | 'url';
  value: string;
}

/** arxivId matches an identifier of arXiv, of the form since 2007 or of the older form, with its version. */
const arxivId = /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/;

/**
 * identifierOf returns the identifier in an input: a DOI, also as an address of doi.org; an ISBN with a right check
 * digit; a PubMed ID of up to 8 digits; an arXiv ID; an address of arXiv or PubMed as its identifier; another web
 * address. A prefix such as `doi:`, `isbn:`, `pmid:` or `arXiv:` names the kind.
 * @param text - The input.
 */
export function identifierOf(text: string): Identifier | undefined {
  const value = text.trim();
  const prefixed = /^(doi|isbn|pmid|arxiv):\s*(\S+)$/i.exec(value);
  if (prefixed) {
    const kind = prefixed[1].toLowerCase();
    const found = identifierOf(prefixed[2]);
    return found && found.kind === kind ? found : kind === 'pmid' && /^\d+$/.test(prefixed[2]) ? { kind: 'pmid', value: prefixed[2] } : undefined;
  }
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return undefined;
    }
    const host = url.hostname.toLowerCase();
    if (host === 'doi.org' || host === 'dx.doi.org') {
      const doi = decodeURIComponent(url.pathname.slice(1));
      return /^10\.\d{4,9}\/\S+$/.test(doi) ? { kind: 'doi', value: cleanDoi(doi) } : undefined;
    }
    const arxiv = /^(?:www\.|export\.)?arxiv\.org$/.test(host) ? /^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/.exec(url.pathname)?.[1] : undefined;
    if (arxiv && arxivId.test(arxiv)) {
      return { kind: 'arxiv', value: arxiv.replace(/v\d+$/, '') };
    }
    const pubmed = host === 'pubmed.ncbi.nlm.nih.gov' ? /^\/(\d+)\/?$/.exec(url.pathname)?.[1] : host === 'www.ncbi.nlm.nih.gov' ? /^\/pubmed\/(\d+)\/?$/.exec(url.pathname)?.[1] : undefined;
    return pubmed ? { kind: 'pmid', value: pubmed } : { kind: 'url', value };
  }
  if (/^10\.\d{4,9}\/\S+$/.test(value)) {
    return { kind: 'doi', value: cleanDoi(value) };
  }
  if (arxivId.test(value)) {
    return { kind: 'arxiv', value: value.replace(/v\d+$/, '') };
  }
  if (/^[\d\s-]{9,}[\dXx]$/.test(value) && isIsbn(cleanIsbn(value))) {
    return { kind: 'isbn', value: cleanIsbn(value) };
  }
  return /^\d{1,8}$/.test(value) ? { kind: 'pmid', value } : undefined;
}

/** neededFields are the fields that APA 7 needs for a source of a type; a type without an entry needs the default. */
const neededFields: Record<string, readonly string[]> = {
  'article-journal': ['author', 'issued', 'title', 'container-title', 'volume', 'page'],
  'paper-conference': ['author', 'issued', 'title', 'container-title', 'publisher'],
  chapter: ['author', 'issued', 'title', 'editor', 'container-title', 'page', 'publisher'],
  book: ['author', 'issued', 'title', 'publisher'],
  report: ['author', 'issued', 'title', 'publisher'],
  thesis: ['author', 'issued', 'title', 'genre', 'publisher'],
  article: ['author', 'issued', 'title', 'publisher'],
  dataset: ['author', 'issued', 'title', 'publisher'],
  webpage: ['issued', 'title', 'container-title', 'URL'],
  'post-weblog': ['author', 'issued', 'title', 'container-title', 'URL'],
  default: ['author', 'issued', 'title'],
};

/**
 * missingFields returns the fields that a source of its type needs and does not have; an editor counts as the author
 * of a book.
 * @param source - The source.
 */
export function missingFields(source: Source): string[] {
  const needed = neededFields[source.type ?? ''] ?? neededFields.default;
  const has = (field: string) => source[field] !== undefined || (field === 'author' && source.editor !== undefined);
  return needed.filter((field) => !has(field));
}

/** umlauts are the German letters with their spelling without the umlaut, as in `wirtschaftskammeroesterreich`. */
const umlauts: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/**
 * plain returns a text in small letters, with the German umlauts as "ae", "oe" and "ue", without other accents and
 * without the characters that are no letter or digit; the letters of other scripts, such as Japanese, stay.
 * @param text - The text.
 */
const plain = (text: string): string =>
  text
    .normalize('NFC')
    .replace(/[äöüÄÖÜß]/g, (letter) => umlauts[letter])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * sourceId returns the ID of a new source by the rules of decision 22: the family name of the first author and the
 * year (`hong2024`), the full name of an organization and the year (`worldeconomicforum2025`), the first word of the
 * title and the year without an author, no year without a date; with the letter `a`, `b`, … when the database has the
 * ID already.
 * @param source - The source.
 * @param taken - The IDs of the database.
 */
export function sourceId(source: Source, taken: ReadonlySet<string>): string {
  const first = (source.author ?? source.editor ?? [])[0];
  const name = first ? plain(first.family ? `${first['non-dropping-particle'] ?? ''}${first.family}` : (first.literal ?? '')) : plain((source.title ?? '').split(/\s+/)[0] ?? '');
  const year = source.issued?.['date-parts']?.[0]?.[0];
  const base = `${name || 'source'}${year ?? ''}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let index = 0; ; index++) {
    const letters = index < 26 ? String.fromCharCode(97 + index) : `${String.fromCharCode(97 + Math.floor(index / 26) - 1)}${String.fromCharCode(97 + (index % 26))}`;
    if (!taken.has(`${base}${letters}`)) {
      return `${base}${letters}`;
    }
  }
}

/**
 * sameSource returns the source of the database that is the same as a new source: the same DOI, the same ISBN, or the
 * same title and year.
 * @param source - The new source.
 * @param sources - The sources of the database.
 */
export function sameSource(source: Source, sources: readonly Source[]): { source: Source; by: 'DOI' | 'ISBN' | 'title and year' } | undefined {
  const doi = typeof source.DOI === 'string' ? cleanDoi(source.DOI) : undefined;
  const isbn = typeof source.ISBN === 'string' ? isbn13(cleanIsbn(source.ISBN)) : undefined;
  const title = plain(source.title ?? '');
  const year = source.issued?.['date-parts']?.[0]?.[0];
  for (const other of sources) {
    if (doi && typeof other.DOI === 'string' && cleanDoi(other.DOI) === doi) {
      return { source: other, by: 'DOI' };
    }
    if (isbn && typeof other.ISBN === 'string' && isbn13(cleanIsbn(other.ISBN)) === isbn) {
      return { source: other, by: 'ISBN' };
    }
    if (title && plain(other.title ?? '') === title && other.issued?.['date-parts']?.[0]?.[0] === year) {
      return { source: other, by: 'title and year' };
    }
  }
  return undefined;
}
