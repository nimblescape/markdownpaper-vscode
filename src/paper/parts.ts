// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The parts of a paper document in the clean editing view of Markdown Notes, the text editor that keeps the format of
 * the file ([R-GEN-003](../../docs/requirements.md#r-gen-003), [decision 71](../../docs/requirements.md#decisions)). The
 * view hides the markup that the editor of nimblescape Markdown hides
 * ([R-EDIT-001](../../docs/requirements.md#r-edit-001)), and keeps the parts that the format step writes read-only:
 *
 * - Hidden block: the database of the sources ([R-CITE-001](../../docs/requirements.md#r-cite-001)), wherever it
 *   stands, when its comment has its end.
 * - Hidden markers: the anchor at the start of each entry of the reference list, the markers of the lists of the
 *   special sections, for example `<!-- toc -->` ([R-GEN-008](../../docs/requirements.md#r-gen-008)), and the start
 *   marker of each argument to research ([R-CITE-002](../../docs/requirements.md#r-cite-002)).
 * - Generated parts: the text of each citation between its square brackets, each entry of the reference list, and
 *   each list of a special section with its markers.
 *
 * The lists and their markers count only in a paper document, because other tools write the marker `<!-- toc -->`
 * too. The module uses no API of VS Code.
 */

import { anchorStart, findCitations, findDatabase, noteMarkup, researchMarkers, textLines, type Marker } from './citations';
import { isPaperDocument } from './frontMatter';
import { listCodes } from './marks';

/** Block is a block of whole lines of a file, from its first to its last line. */
export interface Block {
  first: number;
  last: number;
}

/** listMarker matches a marker of a list of a special section, with `/` for the end marker and the name of the list. */
const listMarker = new RegExp(String.raw`^\s*<!--\s*(/?)(${Object.values(listCodes).join('|')})\s*-->\s*$`, 'i');

/** Analysis is what the module finds in a text: the identifiers of its sources, its entries and its lists. */
interface Analysis {
  ids: Set<string>;
  entries: { block: Block; anchor: Marker }[];
  lists: Block[];
}

/** analyzed holds the analysis of the last text: Markdown Notes asks for the markers and the parts of one text often. */
let analyzed: { text: string; analysis: Analysis } | undefined;

/**
 * analysisOf returns the identifiers of the sources of the database of a text, its entries and its lists.
 * @param lines - The lines of the text.
 */
function analysisOf(lines: readonly string[]): Analysis {
  const text = lines.join('\n');
  if (analyzed?.text !== text) {
    const ids = new Set(findDatabase(lines)?.sources.map((source) => source.id) ?? []);
    analyzed = { text, analysis: { ids, entries: entriesOf(lines, ids), lists: listsOf(lines, text) } };
  }
  return analyzed.analysis;
}

/**
 * hiddenDatabase returns the database of the sources as a hidden block, wherever it stands, when its comment has its
 * end: Markdown Notes keeps the block at the end of the file.
 * @param lines - The lines of the file.
 */
export function hiddenDatabase(lines: readonly string[]): Block[] {
  const database = findDatabase(lines);
  return database && lines[database.end].includes('-->') ? [{ first: database.start, last: database.end }] : [];
}

/**
 * entriesOf returns the entries of the reference list of a text: each paragraph that starts with the anchor of a source
 * of the database, with the anchor.
 * @param lines - The lines of the text.
 * @param ids - The identifiers of the sources.
 */
function entriesOf(lines: readonly string[], ids: ReadonlySet<string>): { block: Block; anchor: Marker }[] {
  if (ids.size === 0) {
    return [];
  }
  const blank = (line: number) => line >= lines.length || lines[line].trim() === '';
  return textLines(lines).flatMap((line) => {
    const match = anchorStart.exec(lines[line]);
    if (!match || !ids.has(match[1]) || !blank(line - 1)) {
      return [];
    }
    let last = line;
    while (!blank(last + 1)) {
      last++;
    }
    return [{ block: { first: line, last }, anchor: { line, start: 0, end: match[0].length } }];
  });
}

/**
 * listsOf returns the lists of the special sections of a paper document: each pair of an open and an end marker of the
 * same list, outside code, as a block from the open to the end marker. Another text has none.
 * @param lines - The lines of the text.
 * @param text - The text.
 */
function listsOf(lines: readonly string[], text: string): Block[] {
  if (!lines.some((line) => listMarker.test(line)) || !isPaperDocument(text)) {
    return [];
  }
  const lists: Block[] = [];
  const open = new Map<string, number>();
  for (const line of textLines(lines)) {
    const match = listMarker.exec(lines[line]);
    if (!match) {
      continue;
    }
    const code = match[2].toLowerCase();
    if (match[1] === '') {
      open.set(code, line);
    } else if (open.has(code)) {
      lists.push({ first: open.get(code)!, last: line });
      open.delete(code);
    }
  }
  return lists.sort((a, b) => a.first - b.first);
}

/**
 * hiddenMarkers returns the markers of a paper document that the clean editing view hides: the anchor at the start of
 * each entry of the reference list, the markers of the lists of the special sections as the whole text of their lines,
 * and the start marker of each argument to research with the `<wbr>` before it.
 * @param lines - The lines of the file.
 */
export function hiddenMarkers(lines: readonly string[]): Marker[] {
  const { entries, lists } = analysisOf(lines);
  const markers: Marker[] = [...researchMarkers(lines), ...entries.map((entry) => entry.anchor)];
  for (const list of lists) {
    for (const line of [list.first, list.last]) {
      markers.push({ line, start: 0, end: lines[line].trimEnd().length });
    }
  }
  return markers.sort((a, b) => a.line - b.line || a.start - b.start);
}

/**
 * generatedParts returns the parts of a paper document that the format step writes, which the clean editing view
 * keeps read-only: the text of each citation between its square brackets, without one that holds the markup of a note,
 * as a part of its line; and each entry of the reference list and each list of a special section with its markers, as
 * a block of whole lines.
 * @param lines - The lines of the file.
 */
export function generatedParts(lines: readonly string[]): (Marker | Block)[] {
  const { ids, entries, lists } = analysisOf(lines);
  const citations: Marker[] = (ids.size > 0 ? findCitations(lines, ids) : [])
    .filter((citation) => citation.textEnd > citation.textStart && !noteMarkup.test(lines[citation.line].slice(citation.textStart, citation.textEnd)))
    .map((citation) => ({ line: citation.line, start: citation.textStart, end: citation.textEnd }));
  return [...citations, ...entries.map((entry) => entry.block), ...lists];
}
