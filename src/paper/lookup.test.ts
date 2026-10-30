// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the lookups of new sources (R-CITE-005) with a network that answers with the recorded answers of
 * test/fixtures/metadata/, at the addresses that doi.org redirects to on 2026-10-30.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { type Fetcher, lookUpFile, lookUpIdentifier, searchWorks } from './lookup';

/**
 * fixture returns the text of a recorded answer.
 * @param name - The name of the file in test/fixtures/metadata/.
 */
const fixture = (name: string): string => fs.readFileSync(path.join(__dirname, '../../test/fixtures/metadata', name), 'utf8');

/** Answer is the answer of the network for the addresses that start with a text. */
interface Answer {
  status?: number;
  type?: string;
  url?: string;
  body: string | Uint8Array;
}

/**
 * network returns a fetcher that answers with the first answer whose key starts the address, else with status 404,
 * and lists the asked addresses.
 * @param answers - The answers by the start of the address.
 */
function network(answers: Record<string, Answer>): { fetch: Fetcher; asked: string[] } {
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => {
    asked.push(url);
    const key = Object.keys(answers).find((start) => url.startsWith(start));
    if (!key) {
      return { status: 404, type: 'text/plain', url, body: new Uint8Array() };
    }
    const answer = answers[key];
    const body = typeof answer.body === 'string' ? new TextEncoder().encode(answer.body) : answer.body;
    return { status: answer.status ?? 200, type: answer.type ?? 'application/json', url: answer.url ?? url, body };
  };
  return { fetch, asked };
}

const today = new Date(2026, 9, 30);

describe('the lookup of an identifier', () => {
  test('a DOI comes from doi.org, which names its registry by the address it redirects to', async () => {
    const { fetch } = network({
      'https://doi.org/10.3390/bs9040039': { body: fixture('doi-journal.json'), url: 'https://api.crossref.org/v1/works/10.3390%2Fbs9040039/transform' },
      'https://doi.org/10.48550/arXiv.2308.00352': { body: fixture('doi-datacite.json'), url: 'https://data.crosscite.org/10.48550%2FarXiv.2308.00352' },
      'https://doi.org/10.1400/219393': { body: fixture('doi-medra.json'), url: 'https://data.medra.org/10.1400%2F219393' },
    });
    const journal = await lookUpIdentifier({ kind: 'doi', value: '10.3390/bs9040039' }, { fetch, today });
    expect(journal).toMatchObject({ from: 'doi.org (Crossref)', notes: [], sources: [{ id: '', type: 'article-journal', DOI: '10.3390/bs9040039' }] });
    expect(journal.problem).toBeUndefined();
    expect((await lookUpIdentifier({ kind: 'doi', value: '10.1400/219393' }, { fetch, today })).from).toBe('doi.org (mEDRA)');
    // arXiv: the DOI of arXiv at DataCite; the answer of arXiv names no published version here.
    const arxiv = await lookUpIdentifier({ kind: 'arxiv', value: '2308.00352' }, { fetch, today });
    expect(arxiv).toMatchObject({ from: 'doi.org (DataCite)', notes: [], sources: [{ publisher: 'arXiv' }] });
  });

  test('a DOI that doi.org does not know gives a problem and no source', async () => {
    const { fetch } = network({});
    const found = await lookUpIdentifier({ kind: 'doi', value: '10.1000/none' }, { fetch, today });
    expect(found.sources).toEqual([]);
    expect(found.problem).toBe('doi.org does not know it (DOI 10.1000/none).');
  });

  test('arXiv names the DOI of a published version as a note', async () => {
    const { fetch } = network({
      'https://doi.org/10.48550/arXiv.2308.00352': { body: fixture('doi-datacite.json'), url: 'https://data.crosscite.org/10.48550%2FarXiv.2308.00352' },
      'https://export.arxiv.org/': { type: 'application/atom+xml', body: '<feed><entry><arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/Published</arxiv:doi></entry></feed>' },
    });
    const found = await lookUpIdentifier({ kind: 'arxiv', value: '2308.00352' }, { fetch, today });
    expect(found.notes).toEqual(['arXiv names a published version with the DOI 10.1000/published; add it by its DOI when the text cites that version.']);
  });

  test('an ISBN comes from the DNB, else from K10plus, else from Open Library', async () => {
    const dnb = network({ 'https://services.dnb.de/': { type: 'application/xml;charset=UTF-8', body: fixture('dnb-isbn.xml') } });
    const first = await lookUpIdentifier({ kind: 'isbn', value: '9783825247539' }, { fetch: dnb.fetch, today });
    expect(first).toMatchObject({ from: 'the German National Library', sources: [{ type: 'book', ISBN: '9783825247539', publisher: 'Verlag Julius Klinkhardt' }] });
    expect(dnb.asked).toHaveLength(1);

    const k10plus = network({ 'https://sru.k10plus.de/': { type: 'application/xml', body: fixture('k10plus-isbn.xml') } });
    expect(await lookUpIdentifier({ kind: 'isbn', value: '9783825247539' }, { fetch: k10plus.fetch, today })).toMatchObject({ from: 'K10plus', sources: [{ ISBN: '9783825247539' }] });

    const openLibrary = network({ 'https://openlibrary.org/': { body: fixture('openlibrary.json') } });
    const last = await lookUpIdentifier({ kind: 'isbn', value: '9780262033848' }, { fetch: openLibrary.fetch, today });
    expect(last).toMatchObject({ from: 'Open Library', sources: [{ title: 'Introduction to Algorithms', ISBN: '9780262033848' }] });
    expect(openLibrary.asked.map((url) => new URL(url).hostname)).toEqual(['services.dnb.de', 'sru.k10plus.de', 'openlibrary.org']);
  });

  test('an ISBN that no catalog knows gives a problem with the answer of each catalog', async () => {
    const { fetch } = network({ 'https://openlibrary.org/': { body: '{}' } });
    const found = await lookUpIdentifier({ kind: 'isbn', value: '9780262033848' }, { fetch, today });
    expect(found.sources).toEqual([]);
    expect(found.problem).toBe('No catalog knows the ISBN 9780262033848: the German National Library does not know it; K10plus does not know it; Open Library does not know it.');
  });

  test('a PubMed ID comes from PubMed, then from doi.org with the PubMed ID added, without the day of the lookup', async () => {
    const pubmed = { type: 'application/json', body: fixture('pubmed-csl.json') };
    const alone = await lookUpIdentifier({ kind: 'pmid', value: '37189997' }, { fetch: network({ 'https://api.ncbi.nlm.nih.gov/': pubmed }).fetch, today });
    expect(alone).toMatchObject({ from: 'PubMed', sources: [{ id: '', PMID: '37189997', DOI: '10.3390/children10040748' }] });
    expect(alone.sources[0]).not.toHaveProperty('accessed');
    expect(alone.notes[0]).toMatch(/^doi\.org does not know it \(DOI 10\.3390\/children10040748\); the metadata comes from PubMed$/);

    const record = JSON.stringify({ type: 'journal-article', title: 'Muscle Activity during Handwriting on a Tablet', DOI: '10.3390/children10040748', publisher: 'MDPI AG' });
    const { fetch } = network({ 'https://api.ncbi.nlm.nih.gov/': pubmed, 'https://doi.org/': { body: record, url: 'https://api.crossref.org/v1/works/x/transform' } });
    const both = await lookUpIdentifier({ kind: 'pmid', value: '37189997' }, { fetch, today });
    expect(both).toMatchObject({ from: 'PubMed, then doi.org (Crossref)', notes: [], sources: [{ type: 'article-journal', publisher: 'MDPI AG', PMID: '37189997' }] });
  });

  test('a web address with the tags of Google Scholar, and a PDF behind an address', async () => {
    const page = '<html><head><meta name="citation_title" content="Ein Bericht"><meta name="citation_author" content="Muster, Erika"><meta name="citation_date" content="2024/05/02"><meta name="citation_publisher" content="Verlag"></head></html>';
    const { fetch } = network({
      'https://example.org/page': { type: 'text/html; charset=utf-8', body: page },
      'https://example.org/file': { type: 'application/octet-stream', body: '%PDF-1.4\n%%EOF' },
    });
    const found = await lookUpIdentifier({ kind: 'url', value: 'https://example.org/page' }, { fetch, today });
    expect(found).toMatchObject({ from: 'example.org', sources: [{ title: 'Ein Bericht', author: [{ family: 'Muster', given: 'Erika' }] }] });
    expect(found.problem).toBeUndefined();
    const pdf = await lookUpIdentifier({ kind: 'url', value: 'https://example.org/file' }, { fetch, today });
    expect(pdf).toMatchObject({ sources: [], problem: 'The metadata of the PDF names no DOI.' });
  });

  test('a web address that does not answer asks for the saved page', async () => {
    const { fetch } = network({ 'https://example.org/': { status: 403, body: '' } });
    const found = await lookUpIdentifier({ kind: 'url', value: 'https://example.org/closed' }, { fetch, today });
    expect(found.problem).toBe('example.org answered with the status 403. Save the page in the browser and give the saved HTML file.');
  });

  test('offline, an identifier gives no source', async () => {
    expect((await lookUpIdentifier({ kind: 'doi', value: '10.3390/bs9040039' }, { today })).problem).toBe('With --offline, an identifier gives no source.');
  });
});

describe('the lookup of a file', () => {
  const ris = ['TY  - JOUR', 'AU  - Festman, Julia', 'PY  - 2019', 'TI  - Self-Concepts', 'DO  - 10.3390/bs9040039', 'ER  - ', 'TY  - BOOK', 'AU  - Muster, Erika', 'PY  - 2020', 'TI  - Ein Buch', 'PB  - Verlag', 'ER  - ', ''].join('\n');

  test('an export keeps its metadata offline and gets the metadata of doi.org for a source with a DOI', async () => {
    const offline = await lookUpFile('inbox/export.ris', new TextEncoder().encode(ris), { today });
    expect(offline).toMatchObject({ from: 'the RIS file', notes: [], sources: [{ id: '', title: 'Self-Concepts' }, { id: '', title: 'Ein Buch' }] });

    const { fetch } = network({ 'https://doi.org/10.3390/bs9040039': { body: fixture('doi-journal.json'), url: 'https://api.crossref.org/v1/works/10.3390%2Fbs9040039/transform' } });
    const online = await lookUpFile('inbox/export.ris', new TextEncoder().encode(ris), { fetch, today });
    expect(online.from).toBe('the RIS file, then doi.org (Crossref); the RIS file');
    expect(online.sources.map((source) => source.title)).toEqual([
      'Self-Concepts in Reading and Spelling among Mono- and Multilingual Children: Extending the Bilingual Advantage',
      'Ein Buch',
    ]);
  });

  test('a file of another kind, an empty export and a PDF without a DOI give a problem', async () => {
    expect((await lookUpFile('notes.txt', new Uint8Array(), { today })).problem).toBe('The file is no RIS, BibTeX, CSL JSON, HTML or PDF file (.ris, .bib, .json, .html, .pdf).');
    expect((await lookUpFile('empty.bib', new TextEncoder().encode('% nothing'), { today })).problem).toBe('The file holds no source in BibTeX.');
    expect((await lookUpFile('broken.json', new TextEncoder().encode('{'), { today })).problem).toMatch(/^The file cannot be read as CSL JSON: /);
    expect((await lookUpFile('paper.pdf', new TextEncoder().encode('%PDF-1.4\n%%EOF'), { today })).problem).toBe('The metadata of the PDF names no DOI.');
  });

  test('a saved page without metadata is a web page with the day of the access', async () => {
    const found = await lookUpFile('inbox/page.html', new TextEncoder().encode('<html><head><title>Eine Seite</title></head></html>'), { today });
    expect(found).toMatchObject({ from: 'the saved page', sources: [{ type: 'webpage', title: 'Eine Seite', accessed: { 'date-parts': [[2026, 10, 30]] } }] });
  });
});

describe('the search of Crossref', () => {
  test('lists the works of the answer, or the problem', async () => {
    const { fetch, asked } = network({ 'https://api.crossref.org/works': { body: fixture('crossref-search.json') } });
    const found = await searchWorks('Guidelines for Human-AI Interaction', fetch);
    expect(found.works[1].doi).toBe('10.1145/3511605');
    expect(asked[0]).toContain('query.bibliographic=Guidelines%20for%20Human-AI%20Interaction');
    expect(await searchWorks('x', network({}).fetch)).toEqual({ works: [], problem: 'Crossref does not know it' });
  });
});
