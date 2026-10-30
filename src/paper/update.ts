// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The update of a copy of a layout on GitHub ([R-LAY-010](../../docs/requirements.md#r-lay-010)). A new project copies
 * a layout on GitHub into `layouts/<folder>/`, and the field `origin` of the `layout.json` of the copy names where it
 * comes from: the layout, the branch, tag or commit that the copy follows, and the commit of the copied files. The update
 * reads the newest commit of that branch and compares three versions of each file by the IDs of their contents, as Git
 * computes them: the copy, the file at the commit of the copy, and the file at the newest commit. A file that only the
 * repository changed gets its new version, a file that only the project changed stays, and a file that both changed is
 * a conflict. `layout.json` is compared field by field, so the copy keeps its own language, and keeps the form of the
 * file of the repository. The module uses no API of VS Code.
 */

import { createHash } from 'node:crypto';
import { downloadFiles, findRemote, type Origin, parseRemote, readOrigin } from './gallery';
import { editJsonText, type Json, sameJson } from './jsonText';
import { formatText, layoutFile } from './layout';
import type { Fetcher } from './lookup';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * blobId returns the ID of the content of a file as Git computes it: the SHA-1 of `blob`, the size and the content.
 * @param content - The content.
 */
export const blobId = (content: Uint8Array): string => createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');

/** Update is the change of a copy of a layout to the newest commit of the ref of its origin. */
export interface Update {
  /** origin is the new origin of the copy; from is the commit of the copy before the update. */
  origin: Origin;
  from: string;
  /** write holds the new contents of the files by their paths in the folder, and remove the paths of the files to remove. */
  write: Map<string, Uint8Array>;
  remove: string[];
  /** changed are the paths of the files that the repository changed and that the update changes in the copy. */
  changed: string[];
  /** kept are the paths of the files that only the project changed: they stay as they are. */
  kept: string[];
  /** conflicts are the files that the project and the repository both changed; a field of `layout.json` is `layout.json (field)`. */
  conflicts: string[];
}

/**
 * mergeLayoutJson merges the fields of the `layout.json` of the copy, of the repository at the commit of the copy, and
 * of the repository at the new commit. A field that only the repository changed gets its new value, a field that only
 * the copy changed, such as the language of the project, stays, and a field that both changed is a conflict, which gets
 * the new value with `force`. The field `format` is the format of this version, and `origin` comes last.
 * @param copy - The `layout.json` of the copy.
 * @param base - The `layout.json` of the repository at the commit of the copy.
 * @param next - The `layout.json` of the repository at the new commit.
 * @param force - True to take the new value of a field that both changed.
 * @returns The merged fields, without `origin`, the fields with a conflict, and whether a field changed.
 */
export function mergeLayoutJson(copy: Json, base: Json, next: Json, force: boolean): { json: Json; conflicts: string[]; changed: boolean } {
  const json: Json = {};
  const conflicts: string[] = [];
  let changed = false;
  for (const key of new Set([...Object.keys(next), ...Object.keys(copy)])) {
    if (key === 'origin') {
      continue;
    }
    if (key === 'format') {
      json.format = formatText;
      continue;
    }
    let value = copy[key];
    if (!sameJson(base[key], next[key]) && !sameJson(copy[key], next[key])) {
      if (!sameJson(copy[key], base[key])) {
        conflicts.push(key);
      }
      if (sameJson(copy[key], base[key]) || force) {
        value = next[key];
        changed = true;
      }
    }
    if (value !== undefined) {
      json[key] = value;
    }
  }
  return { json, conflicts, changed };
}

/**
 * parseJson reads the object of a `layout.json`.
 * @param content - The content of the file.
 * @param where - Where the file is, for the message of an error.
 */
function parseJson(content: Uint8Array | undefined, where: string): Json {
  try {
    const json: unknown = JSON.parse(decoder.decode(content));
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      return json as Json;
    }
  } catch {
    // The error below names the file.
  }
  throw new Error(`The ${layoutFile} of ${where} is no object of JSON.`);
}

/**
 * planUpdate reads the newest version of a copy of a layout on GitHub and returns the changes of the update. An update
 * with conflicts changes no file unless `force` is true: then the files of the conflicts get the versions of the
 * repository. A copy at the newest commit gets an update without changes, whose `from` is the commit of its origin.
 * @param fetch - The fetcher.
 * @param files - The files of the copy, by their paths in its folder.
 * @param options - A token of GitHub, if any, and `force`.
 */
export async function planUpdate(fetch: Fetcher, files: ReadonlyMap<string, Uint8Array>, options: { token?: string; force?: boolean } = {}): Promise<Update> {
  const json = files.get(layoutFile);
  const origin = json ? readOrigin(decoder.decode(json)) : undefined;
  const spec = origin && parseRemote(origin.layout);
  if (!origin || !spec) {
    throw new Error(`The ${layoutFile} of the copy has no field "origin" with the layout on GitHub, the ref and the commit that the copy comes from.`);
  }
  const next = await findRemote(fetch, { ...spec, ref: origin.ref }, options.token);
  const update: Update = { origin: { ...origin, commit: next.commit }, from: origin.commit, write: new Map(), remove: [], changed: [], kept: [], conflicts: [] };
  if (next.commit === origin.commit) {
    return update;
  }
  const base = await findRemote(fetch, { ...spec, ref: origin.commit }, options.token);
  // The copy has no preview PDF: it shows the empty paper document of the layout, not the document of the project.
  const skipped = new Set([layoutFile, ...[base, next].map((remote) => remote.layout.preview?.replace(/^\.\//, '') ?? '')]);
  const paths = [...new Set([...files.keys(), ...base.files, ...next.files])].filter((path) => !skipped.has(path)).sort();
  const download: string[] = [];
  for (const path of paths) {
    const content = files.get(path);
    const copy = content ? blobId(content) : undefined;
    const before = base.blobs.get(path);
    const after = next.blobs.get(path);
    if (before === after) {
      if (before !== undefined && copy !== before) {
        update.kept.push(path);
      }
      continue;
    }
    if (copy === after) {
      continue;
    }
    if (copy !== before) {
      update.conflicts.push(path);
      if (!options.force) {
        continue;
      }
    }
    update.changed.push(path);
    if (after === undefined) {
      update.remove.push(path);
    } else {
      download.push(path);
    }
  }
  const [baseJson, nextJson] = [(await downloadFiles(fetch, base, [layoutFile])).get(layoutFile), (await downloadFiles(fetch, next, [layoutFile])).get(layoutFile)];
  const merged = mergeLayoutJson(parseJson(json, 'the copy'), parseJson(baseJson, `${origin.layout}@${origin.commit}`), parseJson(nextJson, `${origin.layout}@${next.commit}`), options.force ?? false);
  update.conflicts.push(...merged.conflicts.map((key) => `${layoutFile} (${key})`));
  if (merged.changed) {
    update.changed.unshift(layoutFile);
  }
  // The new layout.json keeps the form of the file of the repository, so that the copy differs from it only in its fields.
  update.write.set(layoutFile, encoder.encode(editJsonText(decoder.decode(nextJson), { ...merged.json, origin: update.origin })));
  for (const [path, content] of await downloadFiles(fetch, next, download)) {
    update.write.set(path, content);
  }
  return update;
}
