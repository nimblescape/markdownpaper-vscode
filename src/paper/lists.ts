// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The format step of the paper that writes the lists of the special sections into the file
 * ([R-REN-004](../../docs/requirements.md#r-ren-004), [R-GEN-008](../../docs/requirements.md#r-gen-008)): the table
 * of contents (TOC), the list of figures (LOF), the list of tables (LOT) and the list of listings (LOL), each as a
 * list of links between two hidden markers under the heading of its section:
 *
 * ```markdown
 * # Inhaltsverzeichnis
 *
 * <!-- toc -->
 * - [1 Einleitung](#einleitung)
 * <!-- /toc -->
 * ```
 *
 * The step reads the file with the renderer, so the numbers of the entries are those of the pages: the numbers of the
 * headings by the rules of the layout, and the numbers of the captions of the file. It replaces the lines between the
 * markers, or adds the markers and the list after the heading, and keeps the rest of the section. The module uses no
 * API of VS Code: the extension runs it as a step of the formatter of Markdown Notes, and the command line in
 * `mp format`.
 */

import type { Layout } from '@nimblescape/markdownlayout';
import { bodyOf, readFrontMatter } from './frontMatter';
import { listCodes } from './marks';
import { type Body, inContents, renderBody } from './markdown';

/** ListCode is the code of a special section with a list that the format step writes. */
export type ListCode = keyof typeof listCodes;

/**
 * escapeText returns the text of a link with a backslash before each character that would end or change the link.
 * @param text - The text.
 */
const escapeText = (text: string): string => text.replace(/[\\[\]*_`<]/g, '\\$&');

/**
 * entriesOf returns the lines of the list of a section, from what the renderer found in the file.
 * @param code - The code of the section.
 * @param body - What the renderer found.
 * @param layout - The layout of the file.
 */
function entriesOf(code: ListCode, body: Body, layout: Layout): string[] {
  if (code === 'TOC') {
    return body.headings
      .filter((heading) => inContents(heading, layout))
      .map((heading) => {
        const text = heading.appendix ? `${heading.number}: ${heading.text}` : heading.number ? `${heading.number} ${heading.text}` : heading.text;
        return `- [${escapeText(text)}](#${heading.id})`;
      });
  }
  const captions = code === 'LOF' ? body.figures : code === 'LOT' ? body.tables : body.listings;
  return captions.map((caption) => `- [${escapeText(`${caption.label}: ${caption.text}`)}](#${caption.id})`);
}

/**
 * listLines returns the lines of the list of a special section for the lines of a paper document, as the format step
 * writes them between the markers.
 * @param lines - The lines of the file.
 * @param layout - The layout of the file, with the language of its front matter.
 * @param code - The code of the section.
 */
export function listLines(lines: readonly string[], layout: Layout, code: ListCode): string[] {
  const text = lines.join('\n');
  return entriesOf(code, renderBody(bodyOf(text, readFrontMatter(text)), layout), layout);
}

/** ListInsertion is the change of a text that inserts a special section with its list: the range, the new text and the place of the heading in it. */
export interface ListInsertion {
  from: number;
  to: number;
  text: string;
  /** heading is the range of the text of the heading in the new text of the change. */
  heading: { from: number; to: number };
}

/**
 * listInsertion returns the change of a text that inserts the special section of a list at a place
 * ([R-REN-004](../../docs/requirements.md#r-ren-004)): the heading of the section in the language of the layout, and the
 * list between its markers, as the format step writes it. On an empty line the section takes the line; in a paragraph
 * it comes after the paragraph; each block has an empty line around it. A document that has the section already gets
 * the line of its heading instead.
 * @param text - The text of the editor, also the clean text of the clean editing view of Markdown Notes.
 * @param at - The place in the text, for example the cursor.
 * @param code - The code of the section.
 * @param layout - The layout of the document, with the language of its front matter.
 * @param source - The text of the file, when the text is another text, such as the clean text: the list then comes from
 * the file with the heading at its end, and the format step writes it again at the save.
 */
export function listInsertion(text: string, at: number, code: ListCode, layout: Layout, source?: string): ListInsertion | { exists: number } {
  const file = source ?? text;
  const existing = renderBody(bodyOf(file, readFrontMatter(file)), layout).headings.find((heading) => heading.section === code);
  if (existing) {
    return { exists: existing.line };
  }
  const heading = `# ${layout.terms.sections[code][0]}`;
  const marker = listCodes[code];
  const blockOf = (entries: readonly string[]) => [heading, '', `<!-- ${marker} -->`, ...entries, `<!-- /${marker} -->`].join('\n');
  const change = placeOf(text, at, blockOf([]));
  const entries =
    source === undefined
      ? listLines((text.slice(0, change.from) + change.text + text.slice(change.to)).split('\n'), layout, code)
      : listLines([...source.split('\n'), '', heading], layout, code);
  const placed = placeOf(text, at, blockOf(entries));
  const offset = placed.text.indexOf(heading);
  return { ...placed, heading: { from: offset + 2, to: offset + heading.length } };
}

/**
 * placeOf returns the change of a text that inserts a block at a place: on an empty line the block takes the line; in a
 * paragraph it comes after the paragraph; the block gets an empty line around it.
 * @param text - The text.
 * @param at - The place in the text.
 * @param block - The block.
 */
function placeOf(text: string, at: number, block: string): { from: number; to: number; text: string } {
  const lines = text.split('\n');
  const starts = [0];
  for (const line of lines) {
    starts.push(starts[starts.length - 1] + line.length + 1);
  }
  const blank = (index: number) => index < 0 || index >= lines.length || lines[index].trim() === '';
  let line = Math.max(0, starts.findIndex((start) => start > Math.max(0, at)) - 1);
  line = Math.min(line, lines.length - 1);
  if (blank(line)) {
    const from = starts[line];
    return { from, to: from + lines[line].replace(/\r$/, '').length, text: `${blank(line - 1) ? '' : '\n'}${block}${blank(line + 1) ? '' : '\n'}` };
  }
  while (!blank(line + 1)) {
    line++;
  }
  const end = starts[line] + lines[line].replace(/\r$/, '').length;
  return { from: end, to: end, text: `\n\n${block}` };
}

/**
 * writeLists returns the lines of a Markdown file with the current lists of its special sections. A file without
 * such a section keeps its lines.
 * @param lines - The lines of the file.
 * @param layout - The layout of the file, with the language of its front matter.
 */
export function writeLists(lines: readonly string[], layout: Layout): string[] {
  const text = lines.join('\n');
  const body = renderBody(bodyOf(text, readFrontMatter(text)), layout);
  const result = [...lines];
  const sections = body.headings.filter((heading): heading is typeof heading & { section: ListCode } => heading.section !== undefined && heading.section in listCodes);
  // From the last section to the first, so that the lines of the sections before stay where they are.
  for (const heading of [...sections].reverse()) {
    const marker = listCodes[heading.section];
    const next = body.headings.find((other) => other.line > heading.line && other.level <= heading.level);
    const end = next ? next.line : result.length;
    // A heading with a line of `=` or `-` below it has two lines.
    const first = /^\s*(?:=+|-+)\s*$/.test(result[heading.line + 1] ?? '') && !/^\s*#/.test(result[heading.line]) ? heading.line + 2 : heading.line + 1;
    const start = result.findIndex((line, index) => index >= first && index < end && new RegExp(`^\\s*<!--\\s*${marker}\\s*-->\\s*$`, 'i').test(line));
    const stop = start < 0 ? -1 : result.findIndex((line, index) => index > start && index < end && new RegExp(`^\\s*<!--\\s*/${marker}\\s*-->\\s*$`, 'i').test(line));
    const entries = entriesOf(heading.section, body, layout);
    if (start >= 0 && stop >= 0) {
      result.splice(start + 1, stop - start - 1, ...entries);
    } else {
      // The markers and the list go after the heading, each block with an empty line around it.
      const block = [`<!-- ${marker} -->`, ...entries, `<!-- /${marker} -->`];
      const blank = (result[first] ?? '').trim() === '';
      result.splice(first, 0, '', ...block, ...(blank || first >= result.length ? [] : ['']));
    }
  }
  return result;
}
