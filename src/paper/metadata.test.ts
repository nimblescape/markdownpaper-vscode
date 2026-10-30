// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the readers of the metadata of new sources (R-CITE-005). The files in test/fixtures/metadata/ are
 * real answers of the services, recorded on 2026-10-30: doi.org for a DOI of Crossref (a journal article, a paper of a
 * conference and a book), of DataCite (arXiv), of mEDRA and of JaLC; the catalogs of the DNB and of K10plus and Open
 * Library for an ISBN; PubMed; arXiv; and a search of Crossref. The exports, the pages and the PDF are written here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { deflateSync } from 'zlib';
import { describe, expect, test } from 'vitest';
import {
  arxivPublished,
  identifierOf,
  isbn13,
  isIsbn,
  missingFields,
  pdfIdentifiers,
  readBibtex,
  readCrossrefSearch,
  readCslJson,
  readHtml,
  readMarcXml,
  readOpenLibrary,
  readRis,
  sameSource,
  sourceId,
} from './metadata';

/**
 * fixture returns the text of a recorded answer.
 * @param name - The name of the file in test/fixtures/metadata/.
 */
const fixture = (name: string): string => fs.readFileSync(path.join(__dirname, '../../test/fixtures/metadata', name), 'utf8');

describe('the identifier of an input', () => {
  test('a DOI, also as an address of doi.org or with a prefix, in small letters', () => {
    expect(identifierOf('10.3390/BS9040039')).toEqual({ kind: 'doi', value: '10.3390/bs9040039' });
    expect(identifierOf('https://doi.org/10.1145/3290605.3300233')).toEqual({ kind: 'doi', value: '10.1145/3290605.3300233' });
    expect(identifierOf('doi:10.1400/219393')).toEqual({ kind: 'doi', value: '10.1400/219393' });
  });

  test('an ISBN with its check digit, a PubMed ID, an arXiv ID and the addresses of arXiv and PubMed', () => {
    expect(identifierOf('978-3-8252-4753-9')).toEqual({ kind: 'isbn', value: '9783825247539' });
    expect(identifierOf('978-3-8252-4753-8')).toBeUndefined();
    expect(identifierOf('3825247538')).toEqual({ kind: 'isbn', value: '3825247538' });
    expect(identifierOf('37189997')).toEqual({ kind: 'pmid', value: '37189997' });
    expect(identifierOf('pmid:37189997')).toEqual({ kind: 'pmid', value: '37189997' });
    expect(identifierOf('https://pubmed.ncbi.nlm.nih.gov/37189997/')).toEqual({ kind: 'pmid', value: '37189997' });
    expect(identifierOf('arXiv:2308.00352v7')).toEqual({ kind: 'arxiv', value: '2308.00352' });
    expect(identifierOf('https://arxiv.org/pdf/2308.00352v2')).toEqual({ kind: 'arxiv', value: '2308.00352' });
    expect(identifierOf('https://www.ris.bka.gv.at/x')).toEqual({ kind: 'url', value: 'https://www.ris.bka.gv.at/x' });
    expect(identifierOf('Lehrer werden')).toBeUndefined();
  });

  test('both forms of an ISBN compare equal', () => {
    expect(isIsbn('9783825247539')).toBe(true);
    expect(isbn13('3825247538')).toBe('9783825247539');
  });
});

describe('the CSL JSON of doi.org and PubMed', () => {
  test('a journal article of Crossref keeps the fields that describe it, and no address beside its DOI', () => {
    expect(readCslJson(fixture('doi-journal.json'))).toEqual([
      {
        type: 'article-journal',
        author: [
          { family: 'Festman', given: 'Julia' },
          { family: 'Schwieter', given: 'John W.' },
        ],
        issued: { 'date-parts': [[2019, 4, 13]] },
        title: 'Self-Concepts in Reading and Spelling among Mono- and Multilingual Children: Extending the Bilingual Advantage',
        'container-title': 'Behavioral Sciences',
        'container-title-short': 'Behavioral Sciences',
        volume: '9',
        issue: '4',
        page: '39',
        publisher: 'MDPI AG',
        ISSN: '2076-328X',
        DOI: '10.3390/bs9040039',
        language: 'en',
        id: '',
      },
    ]);
  });

  test('a paper of a conference gets the CSL type, the place of the publisher and the title of the event', () => {
    const [paper] = readCslJson(fixture('doi-crossref.json'));
    expect(paper).toMatchObject({
      type: 'paper-conference',
      title: 'Guidelines for Human-AI Interaction',
      'container-title': 'Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems',
      page: '1-13',
      publisher: 'ACM',
      'publisher-place': 'New York, NY, USA',
      'event-title': "CHI '19: CHI Conference on Human Factors in Computing Systems",
      DOI: '10.1145/3290605.3300233',
    });
    expect(paper.author).toHaveLength(13);
    expect(paper).not.toHaveProperty('URL');
  });

  test('a book joins its title and its subtitle', () => {
    expect(readCslJson(fixture('doi-book.json'))[0]).toMatchObject({
      type: 'book',
      title: 'Lehrer werden mit Methode: Beratung, Selbstreflexion, Professionalisierung - ein multimediales Arbeitsbuch',
      publisher: 'utb GmbH',
      'publisher-place': 'Stuttgart, Deutschland',
      ISBN: '9783838547534',
    });
  });

  test('the registries DataCite, mEDRA and JaLC; a name with only a given name stays one name', () => {
    expect(readCslJson(fixture('doi-datacite.json'))[0]).toMatchObject({ type: 'article', publisher: 'arXiv', title: 'MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework', issued: { 'date-parts': [[2023]] } });
    expect(readCslJson(fixture('doi-medra.json'))[0]).toMatchObject({ type: 'article-journal', author: [{ family: 'Pellegrini', given: 'Ernestina' }], DOI: '10.1400/219393' });
    expect(readCslJson(fixture('doi-jalc.json'))[0]).toMatchObject({ type: 'document', author: [{ literal: '海洋気象学会' }], issued: { 'date-parts': [[1924, 2]] } });
  });

  test('PubMed gives the PubMed ID and the DOI', () => {
    expect(readCslJson(fixture('pubmed-csl.json'))[0]).toMatchObject({ type: 'article-journal', volume: '10', page: '748', DOI: '10.3390/children10040748', PMID: '37189997' });
  });
});

describe('the catalogs of an ISBN', () => {
  test('the record of the DNB in MARC 21, with its series', () => {
    expect(readMarcXml(fixture('dnb-isbn.xml'), '978-3-8252-4753-9')[0]).toMatchObject({
      type: 'book',
      author: [
        { family: 'Kriesche', given: 'Julia' },
        { family: 'Kahlert', given: 'Joachim' },
      ],
      issued: { 'date-parts': [[2019]] },
      'collection-title': 'UTB',
      'collection-number': '4753',
      publisher: 'Verlag Julius Klinkhardt',
      'publisher-place': 'Bad Heilbrunn',
      ISBN: '9783825247539',
      language: 'de',
    });
  });

  test('K10plus gives the record of the asked ISBN first, with the ISBN as it was asked', () => {
    const [book] = readMarcXml(fixture('k10plus-isbn.xml'), '978-3-8252-4753-9');
    expect(book).toMatchObject({ type: 'book', publisher: 'Verlag Julius Klinkhardt', ISBN: '9783825247539' });
  });

  test('Open Library', () => {
    expect(readOpenLibrary(fixture('openlibrary.json'), '9780262033848')).toEqual([
      {
        type: 'book',
        author: [
          { family: 'Cormen', given: 'Thomas H.' },
          { family: 'Leiserson', given: 'Charles E.' },
          { family: 'Rivest', given: 'Ronald L.' },
          { family: 'Stein', given: 'Clifford' },
        ],
        issued: { 'date-parts': [[2009]] },
        title: 'Introduction to Algorithms',
        publisher: 'The MIT Press',
        'publisher-place': 'Cambridge, MA, USA',
        ISBN: '9780262033848',
        id: '',
      },
    ]);
  });
});

describe('arXiv and the search of Crossref', () => {
  test('arXiv names the DOI of a published version only when it knows one', () => {
    expect(arxivPublished(fixture('arxiv.xml'))).toBeUndefined();
    expect(arxivPublished('<entry><arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/XYZ</arxiv:doi></entry>')).toBe('10.1000/xyz');
  });

  test('a search lists the works with their DOIs, authors, years and titles', () => {
    expect(readCrossrefSearch(fixture('crossref-search.json'))[1]).toEqual({
      doi: '10.1145/3511605',
      authors: 'Li et al.',
      year: 2023,
      title: 'Assessing Human-AI Interaction Early through Factorial Surveys: A Study on the Guidelines for Human-AI Interaction',
      container: 'ACM Transactions on Computer-Human Interaction',
      type: 'article-journal',
    });
  });
});

describe('the exports of databases and reference managers', () => {
  test('RIS: a journal article with its pages, its ISSN and its DOI', () => {
    const ris = ['TY  - JOUR', 'AU  - Festman, Julia', 'AU  - Schwieter, John W.', 'PY  - 2019', 'TI  - Self-Concepts in Reading', 'T2  - Behavioral Sciences', 'VL  - 9', 'IS  - 4', 'SP  - 39', 'SN  - 2076-328X', 'DO  - 10.3390/bs9040039', 'UR  - https://www.mdpi.com/2076-328X/9/4/39', 'ER  - ', ''].join('\r\n');
    expect(readRis(ris)).toEqual([
      {
        type: 'article-journal',
        author: [
          { family: 'Festman', given: 'Julia' },
          { family: 'Schwieter', given: 'John W.' },
        ],
        issued: { 'date-parts': [[2019]] },
        title: 'Self-Concepts in Reading',
        'container-title': 'Behavioral Sciences',
        volume: '9',
        issue: '4',
        page: '39',
        ISSN: '2076-328X',
        DOI: '10.3390/bs9040039',
        id: '',
      },
    ]);
  });

  test('BibTeX: the letters of LaTeX accents, a second edition, an organization in braces and the pages with an en dash', () => {
    const bib = `@book{kahlert2019,
      author = {Kriesche, Julia and Kahlert, Joachim and {Deutsches Institut f{\\"u}r Normung}},
      title = {Lehrer werden mit Methode},
      edition = {2nd},
      year = 2019,
      publisher = {Klinkhardt},
      address = {Bad Heilbrunn},
      pages = {10--20},
    }`;
    expect(readBibtex(bib)).toEqual([
      {
        type: 'book',
        author: [{ family: 'Kriesche', given: 'Julia' }, { family: 'Kahlert', given: 'Joachim' }, { literal: 'Deutsches Institut für Normung' }],
        issued: { 'date-parts': [[2019]] },
        title: 'Lehrer werden mit Methode',
        page: '10-20',
        edition: '2',
        publisher: 'Klinkhardt',
        'publisher-place': 'Bad Heilbrunn',
        id: '',
      },
    ]);
  });
});

describe('web pages', () => {
  const today = new Date(2026, 9, 30);

  test('the tags citation_* of Google Scholar describe the work, and a DOI of them leaves out the address', () => {
    const html = `<html><head>
      <meta name="citation_title" content="Self-Concepts in Reading">
      <meta name="citation_author" content="Festman, Julia">
      <meta name="citation_publication_date" content="2019/04/13">
      <meta name="citation_journal_title" content="Behavioral Sciences">
      <meta name="citation_volume" content="9"><meta name="citation_firstpage" content="39">
      <meta name="citation_doi" content="10.3390/bs9040039">
    </head></html>`;
    expect(readHtml(html, 'https://www.mdpi.com/2076-328X/9/4/39', today)).toEqual({
      sources: [
        {
          type: 'article-journal',
          author: [{ family: 'Festman', given: 'Julia' }],
          issued: { 'date-parts': [[2019, 4, 13]] },
          title: 'Self-Concepts in Reading',
          'container-title': 'Behavioral Sciences',
          volume: '9',
          page: '39',
          DOI: '10.3390/bs9040039',
          id: '',
        },
      ],
      candidates: [],
    });
  });

  test('JSON-LD of schema.org, with an organization as the author', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Report","name":"Future of Jobs Report 2025","author":{"@type":"Organization","name":"World Economic Forum"},"datePublished":"2025-01-07","publisher":{"name":"World Economic Forum"}}</script>`;
    expect(readHtml(html, 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/', today).sources[0]).toMatchObject({
      type: 'report',
      author: [{ literal: 'World Economic Forum' }],
      issued: { 'date-parts': [[2025, 1, 7]] },
      title: 'Future of Jobs Report 2025',
      publisher: 'World Economic Forum',
      URL: 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',
    });
  });

  test('a page without metadata of a work is a web page with the day of the access, and its DOIs are candidates', () => {
    const html = `<!-- saved from url=(0033)https://www.example.org/wirtschaft -->
      <html lang="de"><head><title>Wirtschaft in Vorarlberg</title><meta property="og:site_name" content="Beispiel"></head>
      <body><a href="https://doi.org/10.1000/abc">Studie</a></body></html>`;
    expect(readHtml(html, undefined, today)).toEqual({
      sources: [
        {
          type: 'webpage',
          accessed: { 'date-parts': [[2026, 10, 30]] },
          title: 'Wirtschaft in Vorarlberg',
          'container-title': 'Beispiel',
          URL: 'https://www.example.org/wirtschaft',
          language: 'de',
          id: '',
        },
      ],
      candidates: ['10.1000/abc'],
    });
  });
});

describe('the DOI of a PDF file', () => {
  /**
   * pdfOf returns the bytes of a small PDF file: an XMP packet in a compressed stream, and a text with a DOI that the
   * paper cites.
   * @param xmp - The XMP packet.
   */
  const pdfOf = (xmp: string): Uint8Array => {
    const stream = deflateSync(Buffer.from(xmp, 'latin1'));
    const text = Buffer.from('BT (Siehe https://doi.org/10.5555/cited.1 und arXiv:2308.00352v7) Tj ET', 'latin1');
    return Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Metadata /Subtype /XML /Filter /FlateDecode /Length ' + stream.length + ' >>\nstream\n', 'latin1'),
      stream,
      Buffer.from('\nendstream\nendobj\n2 0 obj\n<< /Length ' + text.length + ' >>\nstream\n', 'latin1'),
      text,
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
  };

  test('the DOI of the metadata names the paper; the other DOIs and arXiv IDs are only candidates', () => {
    expect(pdfIdentifiers(pdfOf('<x:xmpmeta><rdf:Description><prism:doi>10.3390/BS9040039</prism:doi></rdf:Description></x:xmpmeta>'))).toEqual({
      metadata: ['10.3390/bs9040039'],
      other: ['10.5555/cited.1', 'arXiv:2308.00352'],
    });
    expect(pdfIdentifiers(pdfOf('<x:xmpmeta></x:xmpmeta>')).metadata).toEqual([]);
  });
});

describe('the ID, the fields that are missing and the sources that the database has', () => {
  test('the ID by decision 22: the family name and the year, an organization in full, a letter for an ID that is taken', () => {
    expect(sourceId({ id: '', author: [{ family: 'Hong', given: 'Sirui' }], issued: { 'date-parts': [[2024]] } }, new Set())).toBe('hong2024');
    expect(sourceId({ id: '', author: [{ family: 'Hong', given: 'Sirui' }], issued: { 'date-parts': [[2024]] } }, new Set(['hong2024', 'hong2024a']))).toBe('hong2024b');
    expect(sourceId({ id: '', author: [{ literal: 'World Economic Forum' }], issued: { 'date-parts': [[2025]] } }, new Set())).toBe('worldeconomicforum2025');
    expect(sourceId({ id: '', title: 'Österreichische Schulen', author: [] }, new Set())).toBe('oesterreichische');
    expect(sourceId({ id: '', author: [{ literal: 'Wirtschaftskammer Österreich' }] }, new Set())).toBe('wirtschaftskammeroesterreich');
    expect(sourceId({ id: '', author: [{ family: 'Gödel', given: 'Kurt' }, { family: 'Čapek' }], issued: { 'date-parts': [[1931]] } }, new Set())).toBe('goedel1931');
    expect(sourceId({ id: '', author: [{ family: 'Čapek', given: 'Karel' }], issued: { 'date-parts': [[1920]] } }, new Set())).toBe('capek1920');
    expect(sourceId({ id: '', author: [{ literal: '海洋気象学会' }], issued: { 'date-parts': [[1924, 2]] } }, new Set())).toBe('海洋気象学会1924');
  });

  test('the fields that a source of its type needs, an editor for the author of a book', () => {
    expect(missingFields({ id: '', type: 'book', title: 'T', issued: { 'date-parts': [[2019]] }, editor: [{ family: 'E' }] })).toEqual(['publisher']);
    expect(missingFields({ id: '', type: 'article-journal', title: 'T' })).toEqual(['author', 'issued', 'container-title', 'volume', 'page']);
  });

  test('a source that the database has: the same DOI, ISBN in either form, or title and year', () => {
    const database = [
      { id: 'festman2019', DOI: '10.3390/BS9040039' },
      { id: 'kriesche2019', ISBN: '3-8252-4753-8' },
      { id: 'wef2025', title: 'Future of Jobs Report 2025', issued: { 'date-parts': [[2025]] } },
    ];
    expect(sameSource({ id: '', DOI: '10.3390/bs9040039' }, database)).toMatchObject({ source: { id: 'festman2019' }, by: 'DOI' });
    expect(sameSource({ id: '', ISBN: '9783825247539' }, database)).toMatchObject({ source: { id: 'kriesche2019' }, by: 'ISBN' });
    expect(sameSource({ id: '', title: 'Future of jobs report 2025.', issued: { 'date-parts': [[2025, 1]] } }, database)).toMatchObject({ by: 'title and year' });
    expect(sameSource({ id: '', title: 'Future of Jobs Report 2025', issued: { 'date-parts': [[2023]] } }, database)).toBeUndefined();
  });
});
