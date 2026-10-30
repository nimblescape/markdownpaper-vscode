// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The sources of Zotero ([R-CITE-006](../../docs/requirements.md#r-cite-006)): this module reads the library of the
 * author through the Zotero web API, finds the line of an item in the database of a document, and merges the item into
 * it. An item finds its line by the field `zotero` of the line (its library and its item key), then by the DOI, then
 * by the ISBN; else it becomes a new line with an ID by decision 22. A merge adds the fields that the line does not
 * have, changes a field with another value only when the author confirms it, removes nothing, and keeps the ID. The
 * module gets the network as a Fetcher and uses no API of VS Code.
 */

import type { Source } from './csl';
import { sameJson } from './jsonText';
import type { Fetcher } from './lookup';
import { cleanDoi, cleanIsbn, isbn13, keepFields, sourceId } from './metadata';

/** zoteroApi is the address of the Zotero web API. */
export const zoteroApi = 'https://api.zotero.org';

/** zoteroField is the CSL field of a line of the database with the library and the item key of its item of Zotero. */
export const zoteroField = 'zotero';

/** pageSize is the number of items of one request, the most that the web API gives. */
const pageSize = 100;

/** ZoteroItem is an item of a Zotero library: its reference (library and item key), its metadata, and a summary for a list. */
export interface ZoteroItem {
  /** ref is the library and the item key, for example `users/1234567/ABCD1234`, the value of the field `zotero`. */
  ref: string;
  /** source is the metadata of the item in CSL JSON, with only the fields that describe it and an empty ID. */
  source: Source;
  /** creators and year are the names and the year that Zotero shows for the item. */
  creators: string;
  year: string;
  /** children is the number of the attachments and notes of the item. */
  children: number;
}

/**
 * request asks the web API with the API key and returns the text of the answer. The key goes in the header
 * Authorization, which a fetch does not send on to another host, such as the storage of a file.
 * @param fetch - The fetcher.
 * @param key - The API key.
 * @param path - The path and the query, after the address of the API.
 * @param accept - The type of the answer.
 * @throws An Error with the status, for an answer that is not 200.
 */
async function request(fetch: Fetcher, key: string, path: string, accept = 'application/json'): Promise<Uint8Array> {
  const response = await fetch(`${zoteroApi}/${path}`, accept, { Authorization: `Bearer ${key}`, 'Zotero-API-Version': '3' });
  if (response.status === 200) {
    return response.body;
  }
  const reason: Record<number, string> = {
    403: 'Zotero refused the API key, or the key may not read this library',
    404: 'Zotero has no such item or file',
    429: 'Zotero asks to wait before the next request',
  };
  throw new Error(`${reason[response.status] ?? 'Zotero answered with an error'} (status ${response.status}).`);
}

/**
 * keyUser returns the library of the user of an API key, for example `users/1234567`.
 * @param fetch - The fetcher.
 * @param key - The API key.
 */
export async function keyUser(fetch: Fetcher, key: string): Promise<string> {
  const json: unknown = JSON.parse(new TextDecoder().decode(await request(fetch, key, `keys/${encodeURIComponent(key)}`)));
  const user = (json as { userID?: unknown }).userID;
  if (typeof user !== 'number' && typeof user !== 'string') {
    throw new Error('Zotero gave no user for the API key.');
  }
  return `users/${user}`;
}

/**
 * readItems returns the items of an answer of the web API in the format `json` with `include=csljson`, without notes
 * and attachments.
 * @param text - The JSON of the answer: a list of items, or one item.
 */
export function readItems(text: string): ZoteroItem[] {
  const value: unknown = JSON.parse(text);
  const list = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
  const items: ZoteroItem[] = [];
  for (const entry of list) {
    const data = (entry.data ?? {}) as { itemType?: unknown };
    const library = (entry.library ?? {}) as { type?: unknown; id?: unknown };
    const meta = (entry.meta ?? {}) as { creatorSummary?: unknown; parsedDate?: unknown; numChildren?: unknown };
    const csl = entry.csljson;
    if (data.itemType === 'note' || data.itemType === 'attachment' || typeof entry.key !== 'string' || typeof csl !== 'object' || csl === null) {
      continue;
    }
    const kind = library.type === 'group' ? 'groups' : 'users';
    items.push({
      ref: `${kind}/${String(library.id)}/${entry.key}`,
      source: keepFields({ ...(csl as Record<string, unknown>), id: '' }),
      creators: typeof meta.creatorSummary === 'string' ? meta.creatorSummary : '',
      year: typeof meta.parsedDate === 'string' ? meta.parsedDate.slice(0, 4) : '',
      children: typeof meta.numChildren === 'number' ? meta.numChildren : 0,
    });
  }
  return items;
}

/**
 * searchItems returns the top items of a library whose title, creators or year match the words, or the items changed
 * last without words.
 * @param fetch - The fetcher.
 * @param key - The API key.
 * @param library - The library, for example `users/1234567`.
 * @param words - The words of the search.
 * @param limit - The most items.
 */
export async function searchItems(fetch: Fetcher, key: string, library: string, words: string, limit = 25): Promise<ZoteroItem[]> {
  const query = words.trim() ? `q=${encodeURIComponent(words.trim())}&qmode=titleCreatorYear` : 'sort=dateModified&direction=desc';
  return readItems(new TextDecoder().decode(await request(fetch, key, `${library}/items/top?${query}&format=json&include=data,csljson&limit=${limit}`)));
}

/**
 * allItems returns all top items of a library, a page of 100 items with each request.
 * @param fetch - The fetcher.
 * @param key - The API key.
 * @param library - The library, for example `users/1234567`.
 * @param most - The most items, so that a very large library does not ask without end.
 */
export async function allItems(fetch: Fetcher, key: string, library: string, most = 5000): Promise<ZoteroItem[]> {
  const items: ZoteroItem[] = [];
  for (let start = 0; start < most; start += pageSize) {
    const text = new TextDecoder().decode(await request(fetch, key, `${library}/items/top?format=json&include=data,csljson&limit=${pageSize}&start=${start}`));
    const page = JSON.parse(text) as unknown[];
    items.push(...readItems(text));
    if (!Array.isArray(page) || page.length < pageSize) {
      break;
    }
  }
  return items;
}

/**
 * itemOf returns the item of a reference, for example `groups/12345/ABCD1234`, or undefined when Zotero has none.
 * @param fetch - The fetcher.
 * @param key - The API key.
 * @param ref - The reference: the library and the item key.
 */
export async function itemOf(fetch: Fetcher, key: string, ref: string): Promise<ZoteroItem | undefined> {
  const parts = /^((?:users|groups)\/[^/]+)\/([A-Z0-9]+)$/i.exec(ref);
  if (!parts) {
    return undefined;
  }
  try {
    return readItems(new TextDecoder().decode(await request(fetch, key, `${parts[1]}/items/${parts[2]}?format=json&include=data,csljson`)))[0];
  } catch (error) {
    if (error instanceof Error && error.message.includes('status 404')) {
      return undefined;
    }
    throw error;
  }
}

/**
 * pdfOf returns the content of the first PDF file that Zotero stores for an item, or undefined when it stores none:
 * an attachment that only links to a file on a computer has no file on zotero.org, and neither has a library whose
 * files Zotero does not sync to zotero.org.
 * @param fetch - The fetcher.
 * @param key - The API key.
 * @param ref - The reference of the item.
 */
export async function pdfOf(fetch: Fetcher, key: string, ref: string): Promise<Uint8Array | undefined> {
  const parts = /^((?:users|groups)\/[^/]+)\/([A-Z0-9]+)$/i.exec(ref);
  if (!parts) {
    return undefined;
  }
  const children = JSON.parse(new TextDecoder().decode(await request(fetch, key, `${parts[1]}/items/${parts[2]}/children?format=json`))) as unknown;
  const pdf = (Array.isArray(children) ? children : []).find((child: { key?: unknown; data?: { itemType?: unknown; contentType?: unknown; linkMode?: unknown } }) => {
    const data = child.data ?? {};
    return typeof child.key === 'string' && data.itemType === 'attachment' && data.contentType === 'application/pdf' && (data.linkMode === 'imported_file' || data.linkMode === 'imported_url');
  }) as { key: string } | undefined;
  if (!pdf) {
    return undefined;
  }
  try {
    const content = await request(fetch, key, `${parts[1]}/items/${pdf.key}/file`, 'application/pdf');
    return new TextDecoder().decode(content.slice(0, 5)) === '%PDF-' ? content : undefined;
  } catch {
    return undefined;
  }
}

/** Match is the line of the database of an item, and the field that found it. */
export interface Match {
  source: Source;
  by: 'Zotero key' | 'DOI' | 'ISBN';
}

/**
 * matchItem returns the line of the database of an item: the line whose field `zotero` names the item, else the line
 * with the same DOI, else the line with the same ISBN. Undefined means a new line.
 * @param item - The item.
 * @param sources - The sources of the database.
 */
export function matchItem(item: ZoteroItem, sources: readonly Source[]): Match | undefined {
  const byRef = sources.find((source) => source[zoteroField] === item.ref);
  if (byRef) {
    return { source: byRef, by: 'Zotero key' };
  }
  const doiOf = (source: Source) => (typeof source.DOI === 'string' && source.DOI.trim() ? cleanDoi(source.DOI) : undefined);
  const doi = doiOf(item.source);
  const byDoi = doi ? sources.find((source) => doiOf(source) === doi) : undefined;
  if (byDoi) {
    return { source: byDoi, by: 'DOI' };
  }
  const isbnOf = (source: Source) => (typeof source.ISBN === 'string' && cleanIsbn(source.ISBN) ? isbn13(cleanIsbn(source.ISBN)) : undefined);
  const isbn = isbnOf(item.source);
  const byIsbn = isbn ? sources.find((source) => isbnOf(source) === isbn) : undefined;
  return byIsbn ? { source: byIsbn, by: 'ISBN' } : undefined;
}

/** Change is a field of a line whose value in Zotero is another. */
export interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

/** Merge is the merge of an item into its line: the fields to add, the changed values, and the line with each of them. */
export interface Merge {
  id: string;
  /** added are the fields that the line does not have, which the merge adds without a question. */
  added: string[];
  /** changed are the fields with another value in Zotero, which change only after a confirmation. */
  changed: Change[];
  /** kept is the line with the added fields; updated is the line with the added fields and the changed values. */
  kept: Source;
  updated: Source;
}

/**
 * mergeItem merges an item into its line of the database: a field that the line does not have is added, a field with
 * another value is a change, nothing is removed, and the ID stays. The line gets the field `zotero` of the item only
 * when it has none. The fields keep the order of the line, and new fields come after them.
 * @param line - The line of the database.
 * @param item - The item of Zotero.
 */
export function mergeItem(line: Source, item: ZoteroItem): Merge {
  const kept: Source = { ...line };
  const updated: Source = { ...line };
  const added: string[] = [];
  const changed: Change[] = [];
  for (const [field, value] of Object.entries(item.source)) {
    if (field === 'id' || value === undefined) {
      continue;
    }
    if (line[field] === undefined) {
      added.push(field);
      kept[field] = value;
      updated[field] = value;
    } else if (!sameJson(line[field], value)) {
      changed.push({ field, from: line[field], to: value });
      updated[field] = value;
    }
  }
  if (line[zoteroField] === undefined) {
    added.push(zoteroField);
    kept[zoteroField] = item.ref;
    updated[zoteroField] = item.ref;
  }
  return { id: line.id, added, changed, kept, updated };
}

/**
 * newSource returns the new line of an item that the database does not have: its ID by decision 22, its fields, and
 * its reference in the field `zotero`.
 * @param item - The item of Zotero.
 * @param taken - The IDs of the database.
 */
export function newSource(item: ZoteroItem, taken: ReadonlySet<string>): Source {
  const { id: _id, ...fields } = item.source;
  return { id: sourceId(item.source, taken), ...fields, [zoteroField]: item.ref };
}

/**
 * showValue returns a short text of a value of a field, for the question about a change.
 * @param value - The value.
 */
export function showValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
