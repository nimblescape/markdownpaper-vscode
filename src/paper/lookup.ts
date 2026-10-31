// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The lookups of new sources ([R-CITE-005](../../docs/requirements.md#r-cite-005)): this module asks the services that
 * publish the metadata of a source, in the order of the table of R-CITE-005, and reads their answers with
 * metadata.ts. It gets the network as a Fetcher, so that the command uses its own client and the tests their recorded
 * answers.
 */

import type { Source } from './csl';
import {
  arxivPublished,
  type Candidate,
  cleanIsbn,
  type Identifier,
  isbn13,
  pdfIdentifiers,
  readBibtex,
  readCrossrefSearch,
  readCslJson,
  readHtml,
  readMarcXml,
  readOpenLibrary,
  readRis,
} from './metadata';

/** Response is the answer of a service: its status, its content type, its address after the redirects and its body. */
export interface Response {
  status: number;
  type: string;
  url: string;
  body: Uint8Array;
}

/**
 * Fetcher sends a GET request with the header Accept and more headers, if any, and returns the answer; it throws when
 * the host is not reached.
 */
export type Fetcher = (url: string, accept: string, headers?: Readonly<Record<string, string>>) => Promise<Response>;

/** Context is what a lookup needs: the network, or none offline, and the day of the access of a web page. */
export interface Context {
  fetch?: Fetcher;
  today: Date;
}

/** Lookup is the result of one input: its sources, where they came from, notes for the agent, and why it gave none. */
export interface Lookup {
  sources: Source[];
  from: string;
  notes: string[];
  problem?: string;
}

/** cslJson is the media type of CSL JSON, which doi.org gives by content negotiation. */
const cslJson = 'application/vnd.citationstyles.csl+json';

/** registries are the registries of DOIs by the host that doi.org sends a request for CSL JSON to. */
const registries: Record<string, string> = {
  'api.crossref.org': 'Crossref',
  'data.crossref.org': 'Crossref',
  'data.crosscite.org': 'DataCite',
  'api.datacite.org': 'DataCite',
  'data.medra.org': 'mEDRA',
  'japanlinkcenter.org': 'JaLC',
};

/**
 * textOf returns the text of an answer, in the character set of its content type.
 * @param response - The answer.
 */
function textOf(response: Response): string {
  const charset = /charset=["']?([\w-]+)/i.exec(response.type)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(response.body);
  } catch {
    return new TextDecoder('utf-8').decode(response.body);
  }
}

/**
 * ask sends a request and returns the answer with status 200, or the problem.
 * @param fetch - The network.
 * @param url - The address.
 * @param accept - The header Accept.
 * @param service - The name of the service, for the problem.
 */
async function ask(fetch: Fetcher, url: string, accept: string, service: string): Promise<{ response?: Response; problem?: string }> {
  try {
    const response = await fetch(url, accept);
    if (response.status === 200) {
      return { response };
    }
    return { problem: response.status === 404 ? `${service} does not know it` : `${service} answered with the status ${response.status}` };
  } catch (error) {
    return { problem: `${service} cannot be reached: ${(error as Error).message}` };
  }
}

/**
 * byDoi returns the source of a DOI from doi.org, which asks the registry of the DOI.
 * @param doi - The DOI.
 * @param fetch - The network.
 */
export async function byDoi(doi: string, fetch: Fetcher): Promise<{ source?: Source; from: string; problem?: string }> {
  const { response, problem } = await ask(fetch, `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`, cslJson, 'doi.org');
  if (!response) {
    return { from: 'doi.org', problem: `${problem} (DOI ${doi})` };
  }
  let source: Source | undefined;
  try {
    source = readCslJson(textOf(response))[0];
  } catch {
    source = undefined;
  }
  const registry = registries[new URL(response.url).hostname] ?? new URL(response.url).hostname;
  if (!source?.title) {
    return { from: `doi.org (${registry})`, problem: `doi.org gave no metadata for the DOI ${doi}` };
  }
  return { source: { ...source, id: '' }, from: `doi.org (${registry})` };
}

/**
 * withDoi returns the source of doi.org for a source that has a DOI, with the fields of the first source that doi.org
 * does not know, such as a PubMed ID; the first source when doi.org gives none.
 * @param source - The source.
 * @param from - Where the source came from.
 * @param fetch - The network, or undefined offline.
 */
async function withDoi(source: Source, from: string, fetch: Fetcher | undefined): Promise<{ source: Source; from: string; note?: string }> {
  if (!fetch || typeof source.DOI !== 'string') {
    return { source, from };
  }
  const found = await byDoi(source.DOI, fetch);
  if (!found.source) {
    return { source, from, note: `${found.problem}; the metadata comes from ${from}` };
  }
  const kept = Object.fromEntries(['PMID', 'PMCID'].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  return { source: { ...found.source, ...kept }, from: `${from}, then ${found.from}` };
}

/**
 * firstYearOf returns the first year of a book with an ISBN of this form: 2007 for the prefix 979, which came with the
 * ISBNs of 13 digits; 1966 for the group 0, whose ISBNs continue the Standard Book Numbers of the United Kingdom; else
 * 1970, the year of the standard of the ISBN.
 * @param digits - The digits of an ISBN, from cleanIsbn.
 */
function firstYearOf(digits: string): number {
  const isbn = isbn13(digits);
  return isbn.startsWith('979') ? 2007 : isbn.startsWith('9780') ? 1966 : 1970;
}

/** openLibraryNote warns that a record comes only from Open Library, whose records can be wrong. */
const openLibraryNote =
  'Only Open Library knows this ISBN, and some of its records are wrong: compare the title, the authors and the year with the source itself, or name words of the title with --title.';

/**
 * byIsbn returns the source of an ISBN from the catalog of the German National Library, else from K10plus, else from
 * Open Library. A record whose year is before the first year of such an ISBN is wrong, and the next catalog answers.
 * @param isbn - The ISBN.
 * @param fetch - The network.
 */
async function byIsbn(isbn: string, fetch: Fetcher): Promise<Lookup> {
  const digits = cleanIsbn(isbn);
  const first = firstYearOf(digits);
  const problems: string[] = [];
  let wrong = false;
  const catalogs: [string, string, (text: string) => Source[]][] = [
    ['the German National Library', `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=num%3D${digits}&recordSchema=MARC21-xml`, (text) => readMarcXml(text, digits)],
    ['K10plus', `https://sru.k10plus.de/opac-de-627?version=1.1&operation=searchRetrieve&query=pica.isb%3D${digits}&maximumRecords=10&recordSchema=marcxml`, (text) => readMarcXml(text, digits)],
    ['Open Library', `https://openlibrary.org/api/books?bibkeys=ISBN:${digits}&format=json&jscmd=data`, (text) => readOpenLibrary(text, digits)],
  ];
  for (const [name, url, read] of catalogs) {
    const { response, problem } = await ask(fetch, url, name === 'Open Library' ? 'application/json' : 'application/xml', name);
    if (!response) {
      problems.push(problem!);
      continue;
    }
    const source = read(textOf(response))[0];
    if (source?.title && source.ISBN === digits) {
      const year = Number(source.issued?.['date-parts']?.[0]?.[0]);
      if (year < first) {
        wrong = true;
        problems.push(`${name} gives it to "${source.title}" of ${year}, but ISBNs of this form exist only since ${first}, so the record is wrong`);
        continue;
      }
      return { sources: [source], from: name, notes: name === 'Open Library' ? [openLibraryNote] : [] };
    }
    problems.push(`${name} does not know it`);
  }
  const problem = wrong
    ? `No catalog has a right record of the ISBN ${isbn}: ${problems.join('; ')}. Write its line from the source itself.`
    : `No catalog knows the ISBN ${isbn}: ${problems.join('; ')}.`;
  return { sources: [], from: 'the library catalogs', notes: [], problem };
}

/**
 * wordsOf returns the words of a text in small letters, without accents and punctuation.
 * @param text - The text.
 */
const wordsOf = (text: string): string[] =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * titleProblem tells why a source that a lookup found is not the source in hand: its title lacks a word of the title
 * that the agent took from the source itself. Case, accents and punctuation do not count.
 * @param source - The source of the lookup.
 * @param from - Where the metadata came from.
 * @param words - The words of the title of the source in hand.
 */
export function titleProblem(source: Source, from: string, words: string): string | undefined {
  const title = typeof source.title === 'string' ? source.title : '';
  const have = new Set(wordsOf(title));
  const missing = wordsOf(words).filter((word) => !have.has(word));
  if (missing.length === 0) {
    return undefined;
  }
  return `The title of the record from ${from}, "${title}", lacks the words of --title "${missing.join(' ')}", so the record is of another work and nothing is added. Write its line from the source itself.`;
}

/**
 * byPmid returns the source of a PubMed ID from PubMed, and from doi.org when the record has a DOI.
 * @param pmid - The PubMed ID.
 * @param fetch - The network.
 */
async function byPmid(pmid: string, fetch: Fetcher): Promise<Lookup> {
  const { response, problem } = await ask(fetch, `https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=${pmid}`, '*/*', 'PubMed');
  let source: Source | undefined;
  try {
    source = response ? readCslJson(textOf(response))[0] : undefined;
  } catch {
    source = undefined;
  }
  if (!source?.title) {
    return { sources: [], from: 'PubMed', notes: [], problem: `PubMed gave no record for the PubMed ID ${pmid}${problem ? `: ${problem}` : ''}.` };
  }
  // The day of the lookup is no field of the source.
  const { accessed: _accessed, ...record } = { ...source, id: '', PMID: source.PMID ?? pmid };
  const found = await withDoi(record as Source, 'PubMed', fetch);
  return { sources: [found.source], from: found.from, notes: found.note ? [found.note] : [] };
}

/**
 * byArxiv returns the source of an arXiv ID from doi.org with the DOI that arXiv gives each paper, and names the DOI
 * of a published version that arXiv knows.
 * @param id - The arXiv ID, without its version.
 * @param fetch - The network.
 */
async function byArxiv(id: string, fetch: Fetcher): Promise<Lookup> {
  const found = await byDoi(`10.48550/arXiv.${id}`, fetch);
  const notes: string[] = [];
  const { response } = await ask(fetch, `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, 'application/atom+xml', 'arXiv');
  const published = response ? arxivPublished(textOf(response)) : undefined;
  if (published) {
    notes.push(`arXiv names a published version with the DOI ${published}; add it by its DOI when the text cites that version.`);
  }
  return found.source ? { sources: [found.source], from: found.from, notes } : { sources: [], from: found.from, notes, problem: `${found.problem}.` };
}

/**
 * fromPage returns the source of a web page or of a saved page, from its metadata, and from doi.org when the metadata
 * has a DOI.
 * @param html - The HTML of the page.
 * @param url - The address of the page, if known.
 * @param from - Where the page came from, such as its host.
 * @param context - The network and the day of the access.
 */
async function fromPage(html: string, url: string | undefined, from: string, context: Context): Promise<Lookup> {
  const page = readHtml(html, url, context.today);
  const notes = page.candidates.length > 0 ? [`The page names these DOIs: ${page.candidates.slice(0, 10).join(', ')}.`] : [];
  if (page.sources.length === 0) {
    return { sources: [], from, notes, problem: 'The page has no title and no metadata of a work.' };
  }
  const found = await withDoi(page.sources[0], from, context.fetch);
  return { sources: [found.source], from: found.from, notes: found.note ? [...notes, found.note] : notes };
}

/**
 * fromPdf returns the source of a PDF file: the DOI of its metadata, from doi.org. The other DOIs and arXiv IDs of the
 * file are notes only, as they can name the works that the paper cites.
 * @param bytes - The file.
 * @param from - Where the file came from.
 * @param context - The network.
 */
async function fromPdf(bytes: Uint8Array, from: string, context: Context): Promise<Lookup> {
  const { metadata, other } = pdfIdentifiers(bytes);
  const notes = other.length > 0 ? [`The PDF names these identifiers in its text or its links, which can also be the works that it cites: ${other.join(', ')}. Give the one of its title page.`] : [];
  if (metadata.length === 0) {
    return { sources: [], from, notes, problem: 'The metadata of the PDF names no DOI.' };
  }
  if (!context.fetch) {
    return { sources: [], from, notes, problem: `The metadata of the PDF names the DOI ${metadata[0]}; without --offline, doi.org gives its metadata.` };
  }
  const found = await byDoi(metadata[0], context.fetch);
  return found.source ? { sources: [found.source], from: `${from}, then ${found.from}`, notes } : { sources: [], from, notes, problem: `${found.problem}.` };
}

/**
 * lookUpIdentifier returns the source of an identifier: a DOI, an ISBN, a PubMed ID, an arXiv ID or a web address.
 * @param identifier - The identifier.
 * @param context - The network and the day of the access.
 */
export async function lookUpIdentifier(identifier: Identifier, context: Context): Promise<Lookup> {
  const fetch = context.fetch;
  if (!fetch) {
    return { sources: [], from: '', notes: [], problem: 'With --offline, an identifier gives no source.' };
  }
  switch (identifier.kind) {
    case 'doi': {
      const found = await byDoi(identifier.value, fetch);
      return found.source ? { sources: [found.source], from: found.from, notes: [] } : { sources: [], from: found.from, notes: [], problem: `${found.problem}.` };
    }
    case 'isbn':
      return byIsbn(identifier.value, fetch);
    case 'pmid':
      return byPmid(identifier.value, fetch);
    case 'arxiv':
      return byArxiv(identifier.value, fetch);
    case 'url': {
      const host = new URL(identifier.value).hostname;
      const { response, problem } = await ask(fetch, identifier.value, 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8', host);
      if (!response) {
        return { sources: [], from: host, notes: [], problem: `${problem}. Save the page in the browser and give the saved HTML file.` };
      }
      if (/application\/pdf/i.test(response.type) || new TextDecoder().decode(response.body.slice(0, 5)) === '%PDF-') {
        return fromPdf(response.body, host, context);
      }
      return fromPage(textOf(response), identifier.value, host, context);
    }
  }
}

/**
 * lookUpFile returns the sources of a file: an export in RIS, BibTeX or CSL JSON, a saved web page, or a PDF. A source
 * with a DOI gets the metadata of doi.org.
 * @param name - The name of the file, whose extension names its kind.
 * @param bytes - The file.
 * @param context - The network, or none offline, and the day of the access.
 */
export async function lookUpFile(name: string, bytes: Uint8Array, context: Context): Promise<Lookup> {
  const extension = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (extension === 'pdf') {
    return fromPdf(bytes, 'the PDF file', context);
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  if (extension === 'html' || extension === 'htm') {
    return fromPage(text, undefined, 'the saved page', context);
  }
  const readers: Record<string, [string, (text: string) => Source[]]> = {
    ris: ['RIS', readRis],
    bib: ['BibTeX', readBibtex],
    bibtex: ['BibTeX', readBibtex],
    json: ['CSL JSON', readCslJson],
  };
  const reader = readers[extension];
  if (!reader) {
    return { sources: [], from: name, notes: [], problem: 'The file is no RIS, BibTeX, CSL JSON, HTML or PDF file (.ris, .bib, .json, .html, .pdf).' };
  }
  let read: Source[];
  try {
    read = reader[1](text).filter((source) => source.title);
  } catch (error) {
    return { sources: [], from: name, notes: [], problem: `The file cannot be read as ${reader[0]}: ${(error as Error).message}` };
  }
  if (read.length === 0) {
    return { sources: [], from: name, notes: [], problem: `The file holds no source in ${reader[0]}.` };
  }
  const sources: Source[] = [];
  const notes: string[] = [];
  const froms = new Set<string>();
  for (const source of read) {
    const found = await withDoi(source, `the ${reader[0]} file`, context.fetch);
    sources.push({ ...found.source, id: '' });
    froms.add(found.from);
    if (found.note) {
      notes.push(found.note);
    }
  }
  return { sources, from: [...froms].join('; '), notes };
}

/**
 * searchWorks returns up to ten works of Crossref whose title and authors match words.
 * @param words - The words, such as a title.
 * @param fetch - The network.
 */
export async function searchWorks(words: string, fetch: Fetcher): Promise<{ works: Candidate[]; problem?: string }> {
  const { response, problem } = await ask(
    fetch,
    `https://api.crossref.org/works?rows=10&query.bibliographic=${encodeURIComponent(words)}&select=DOI,title,author,issued,type,container-title`,
    'application/json',
    'Crossref',
  );
  return response ? { works: readCrossrefSearch(textOf(response)) } : { works: [], problem };
}
