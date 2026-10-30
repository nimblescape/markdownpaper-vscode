// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the sources of Zotero ([R-CITE-006](../../docs/requirements.md#r-cite-006)). A map of addresses stands
 * for the Zotero web API; the items are made up for the tests, in the form of the answers of the API.
 */

import { describe, expect, test } from 'vitest';
import { findDatabase, updateSources } from './citations';
import type { Source } from './csl';
import type { Fetcher } from './lookup';
import { allItems, itemOf, keyUser, matchItem, mergeItem, newSource, pdfOf, readItems, searchItems, type ZoteroItem } from './zotero';

const encoder = new TextEncoder();
const api = 'https://api.zotero.org';
const key = 'TESTKEY';

/** entry returns an item of the answer of the API with its CSL JSON. */
const entry = (itemKey: string, csljson: Record<string, unknown>, data: Record<string, unknown> = { itemType: 'journalArticle' }, children = 1) => ({
  key: itemKey,
  library: { type: 'user', id: 1234567 },
  meta: { creatorSummary: 'Muster', parsedDate: '2024-03-01', numChildren: children },
  data,
  csljson: { id: `1234567/${itemKey}`, ...csljson },
});

const article = entry('ABCD1234', { type: 'article-journal', title: 'Feedback in der Schule', author: [{ family: 'Muster', given: 'Anna' }], issued: { 'date-parts': [['2024', 3, 1]] }, DOI: '10.1000/XYZ', abstract: 'Not kept.' });
const book = entry('BOOK0001', { type: 'book', title: 'Didaktik', author: [{ family: 'Beispiel', given: 'Bernd' }], issued: { 'date-parts': [[2019]] }, ISBN: '3-8252-4753-8', publisher: 'UTB' }, { itemType: 'book' }, 0);
const note = entry('NOTE0001', {}, { itemType: 'note' });

/** zotero returns a fetcher for the API, which records the headers of each request. */
function zotero(answers: Record<string, unknown>, headers: Record<string, string>[] = []): Fetcher {
  return async (url, _accept, sent = {}) => {
    headers.push({ ...sent });
    const answer = answers[url];
    const body = answer instanceof Uint8Array ? answer : encoder.encode(answer === undefined ? 'Not found' : JSON.stringify(answer));
    return { status: answer === undefined ? 404 : 200, type: 'application/json', url, body };
  };
}

describe('the Zotero web API (R-CITE-006)', () => {
  test('the API key gives the library of its user, and each request has the key in the header Authorization', async () => {
    const headers: Record<string, string>[] = [];
    expect(await keyUser(zotero({ [`${api}/keys/${key}`]: { key, userID: 1234567, access: {} } }, headers), key)).toBe('users/1234567');
    expect(headers[0]).toEqual({ Authorization: `Bearer ${key}`, 'Zotero-API-Version': '3' });
    await expect(keyUser(zotero({}), key)).rejects.toThrow('status 404');
  });

  test('an item has its reference, its CSL JSON with the fields that describe it, and no note', () => {
    const items = readItems(JSON.stringify([article, note, book]));
    expect(items.map((item) => item.ref)).toEqual(['users/1234567/ABCD1234', 'users/1234567/BOOK0001']);
    expect(items[0].source).toEqual({ id: '', type: 'article-journal', title: 'Feedback in der Schule', author: [{ family: 'Muster', given: 'Anna' }], issued: { 'date-parts': [[2024, 3, 1]] }, DOI: '10.1000/xyz' });
    expect(items[0]).toMatchObject({ creators: 'Muster', year: '2024', children: 1 });
    expect(readItems(JSON.stringify({ ...article, library: { type: 'group', id: 99 } }))[0].ref).toBe('groups/99/ABCD1234');
  });

  test('the search asks for the title, the creators and the year; without words it gives the items changed last', async () => {
    const fetch = zotero({
      [`${api}/users/1234567/items/top?q=feedback%20schule&qmode=titleCreatorYear&format=json&include=data,csljson&limit=25`]: [article],
      [`${api}/users/1234567/items/top?sort=dateModified&direction=desc&format=json&include=data,csljson&limit=25`]: [book],
    });
    expect((await searchItems(fetch, key, 'users/1234567', ' feedback schule ')).map((item) => item.ref)).toEqual(['users/1234567/ABCD1234']);
    expect((await searchItems(fetch, key, 'users/1234567', '')).map((item) => item.ref)).toEqual(['users/1234567/BOOK0001']);
  });

  test('all items come in pages of 100', async () => {
    const page = Array.from({ length: 100 }, (_, index) => entry(`K${String(index).padStart(7, '0')}`, { type: 'book', title: `T${index}` }));
    const fetch = zotero({
      [`${api}/users/1234567/items/top?format=json&include=data,csljson&limit=100&start=0`]: page,
      [`${api}/users/1234567/items/top?format=json&include=data,csljson&limit=100&start=100`]: [book],
    });
    expect(await allItems(fetch, key, 'users/1234567')).toHaveLength(101);
  });

  test('an item of a reference, also of a group library, and none for an unknown one', async () => {
    const fetch = zotero({ [`${api}/groups/99/items/ABCD1234?format=json&include=data,csljson`]: { ...article, library: { type: 'group', id: 99 } } });
    expect((await itemOf(fetch, key, 'groups/99/ABCD1234'))?.source.title).toBe('Feedback in der Schule');
    expect(await itemOf(fetch, key, 'users/1/NONE0000')).toBeUndefined();
    expect(await itemOf(fetch, key, 'no reference')).toBeUndefined();
  });

  test('the PDF is the stored PDF attachment of the item; a linked file has no PDF on zotero.org', async () => {
    const pdf = encoder.encode('%PDF-1.7 test');
    const children = (linkMode: string) => [
      { key: 'NOTE0002', data: { itemType: 'note' } },
      { key: 'FILE0001', data: { itemType: 'attachment', contentType: 'application/pdf', linkMode } },
    ];
    const stored = zotero({ [`${api}/users/1234567/items/ABCD1234/children?format=json`]: children('imported_file'), [`${api}/users/1234567/items/FILE0001/file`]: pdf });
    expect(await pdfOf(stored, key, 'users/1234567/ABCD1234')).toEqual(pdf);
    const linked = zotero({ [`${api}/users/1234567/items/ABCD1234/children?format=json`]: children('linked_file'), [`${api}/users/1234567/items/FILE0001/file`]: pdf });
    expect(await pdfOf(linked, key, 'users/1234567/ABCD1234')).toBeUndefined();
    const unsynced = zotero({ [`${api}/users/1234567/items/ABCD1234/children?format=json`]: children('imported_url') });
    expect(await pdfOf(unsynced, key, 'users/1234567/ABCD1234')).toBeUndefined();
  });
});

describe('the merge of an item into the database (R-CITE-006)', () => {
  const [item, bookItem] = readItems(JSON.stringify([article, book])) as [ZoteroItem, ZoteroItem];

  test('an item finds its line by its Zotero key, then by the DOI, then by the ISBN, and else none', () => {
    const byKey: Source = { id: 'other2020', title: 'Another title', DOI: '10.1000/other', zotero: 'users/1234567/ABCD1234' };
    const byDoi: Source = { id: 'muster2024', title: 'Feedback', DOI: 'https://doi.org/10.1000/XYZ' };
    expect(matchItem(item, [byDoi, byKey])).toEqual({ source: byKey, by: 'Zotero key' });
    expect(matchItem(item, [byDoi])).toEqual({ source: byDoi, by: 'DOI' });
    const byIsbn: Source = { id: 'beispiel2019', title: 'Didaktik', ISBN: '978-3-8252-4753-9' };
    expect(matchItem(bookItem, [byIsbn])).toEqual({ source: byIsbn, by: 'ISBN' });
    // The same title and year do not find a line: the rules of Zotero are strict.
    expect(matchItem(item, [{ id: 'muster2024', title: 'Feedback in der Schule', issued: { 'date-parts': [[2024]] } }])).toBeUndefined();
  });

  test('a merge adds the missing fields, asks for the changed ones, removes nothing and keeps the ID', () => {
    const line: Source = { id: 'muster2024', type: 'article-journal', title: 'Feedback in der Schule: Eine Studie', DOI: '10.1000/xyz', page: '1-20' };
    const merge = mergeItem(line, item);
    expect(merge.added).toEqual(['author', 'issued', 'zotero']);
    expect(merge.changed).toEqual([{ field: 'title', from: 'Feedback in der Schule: Eine Studie', to: 'Feedback in der Schule' }]);
    expect(merge.kept).toEqual({ ...line, author: [{ family: 'Muster', given: 'Anna' }], issued: { 'date-parts': [[2024, 3, 1]] }, zotero: 'users/1234567/ABCD1234' });
    expect(merge.updated).toEqual({ ...merge.kept, title: 'Feedback in der Schule' });
    expect(Object.keys(merge.kept)).toEqual(['id', 'type', 'title', 'DOI', 'page', 'author', 'issued', 'zotero']);
    // A line with a key of Zotero keeps it.
    expect(mergeItem({ ...line, zotero: 'groups/99/ABCD1234' }, item).kept.zotero).toBe('groups/99/ABCD1234');
  });

  test('an item without a line becomes a new line with an ID by decision 22 and its key of Zotero', () => {
    expect(newSource(item, new Set(['muster2024']))).toEqual({ ...item.source, id: 'muster2024a', zotero: 'users/1234567/ABCD1234' });
  });

  test('the database gets the merged lines in their places and the new lines at its end', () => {
    const lines = ['# Text', '', '<!-- nimblescape-sources', '{"id":"muster2024","title":"Alt"}', '{"id":"other2020","title":"Other"}', '-->', ''];
    const updated = updateSources(lines, new Map([['muster2024', { id: 'muster2024', title: 'Neu', zotero: 'users/1/A' }]]), [{ id: 'beispiel2019', title: 'Didaktik' }]);
    expect(updated.lines).toEqual(['# Text', '', '<!-- nimblescape-sources', '{"id":"muster2024","title":"Neu","zotero":"users/1/A"}', '{"id":"other2020","title":"Other"}', '{"id":"beispiel2019","title":"Didaktik"}', '-->', '']);
    expect(findDatabase(updated.lines)?.problems).toEqual([]);
    expect(updateSources(['Text'], new Map(), [{ id: 'a2020', title: 'A' }]).lines).toEqual(['Text', '', '<!-- nimblescape-sources', '{"id":"a2020","title":"A"}', '-->']);
    expect(updateSources(['<!-- nimblescape-sources', '{"id":"a"}'], new Map(), []).problem).toContain('no end');
  });
});
