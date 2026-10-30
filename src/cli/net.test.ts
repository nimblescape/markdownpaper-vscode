// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the network of `markdownpaper source` (R-CITE-005): the proxy of the environment variables, and,
 * with MARKDOWNPAPER_LIVE=1, the lookups with the real services, which answer differently over time.
 */

import { describe, expect, test } from 'vitest';
import { version } from '../../package.json';
import { lookUpIdentifier, searchWorks } from '../paper/lookup';
import { httpFetcher, proxyOf } from './net';

describe('the proxy of the environment', () => {
  test('HTTPS_PROXY counts, except for the hosts and domains of NO_PROXY', () => {
    const env = { HTTPS_PROXY: 'http://user:secret@127.0.0.1:3128', NO_PROXY: 'localhost,::1,.example.org,services.dnb.de:443' };
    expect(proxyOf('doi.org', env)?.href).toBe('http://user:secret@127.0.0.1:3128/');
    expect(proxyOf('www.example.org', env)).toBeUndefined();
    expect(proxyOf('example.org', env)).toBeUndefined();
    expect(proxyOf('services.dnb.de', env)).toBeUndefined();
    expect(proxyOf('notexample.org', env)).toBeDefined();
    expect(proxyOf('doi.org', { https_proxy: '127.0.0.1:3128' })?.href).toBe('http://127.0.0.1:3128/');
    expect(proxyOf('doi.org', { HTTPS_PROXY: 'http://127.0.0.1:3128', NO_PROXY: '*' })).toBeUndefined();
    expect(proxyOf('doi.org', {})).toBeUndefined();
  });
});

describe.skipIf(process.env.MARKDOWNPAPER_LIVE !== '1')('the real services', () => {
  const fetch = httpFetcher(`markdownpaper/${version} (+https://github.com/nimblescape/markdownpaper-vscode)`);
  const context = { fetch, today: new Date() };

  test('doi.org with the registries Crossref, DataCite, mEDRA and JaLC', { timeout: 60_000 }, async () => {
    expect(await lookUpIdentifier({ kind: 'doi', value: '10.3390/bs9040039' }, context)).toMatchObject({ from: 'doi.org (Crossref)', sources: [{ type: 'article-journal', volume: '9' }] });
    expect(await lookUpIdentifier({ kind: 'arxiv', value: '2308.00352' }, context)).toMatchObject({ from: 'doi.org (DataCite)', sources: [{ publisher: 'arXiv' }] });
    expect((await lookUpIdentifier({ kind: 'doi', value: '10.1400/219393' }, context)).from).toBe('doi.org (mEDRA)');
    expect((await lookUpIdentifier({ kind: 'doi', value: '10.11501/3307395' }, context)).from).toBe('doi.org (JaLC)');
  });

  test('the DNB for an ISBN, PubMed, and the search of Crossref', { timeout: 60_000 }, async () => {
    expect(await lookUpIdentifier({ kind: 'isbn', value: '9783825247539' }, context)).toMatchObject({ from: 'the German National Library', sources: [{ publisher: 'Verlag Julius Klinkhardt' }] });
    expect(await lookUpIdentifier({ kind: 'pmid', value: '37189997' }, context)).toMatchObject({ from: 'PubMed, then doi.org (Crossref)', sources: [{ PMID: '37189997' }] });
    expect((await searchWorks('Guidelines for Human-AI Interaction', fetch)).works.length).toBeGreaterThan(0);
  });
});
