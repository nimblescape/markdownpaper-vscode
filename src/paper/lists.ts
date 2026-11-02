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

import { bodyOf, readFrontMatter } from './frontMatter';
import type { Layout } from './layout';
import { type Body, inContents, renderBody } from './markdown';

/** listCodes are the codes of the sections with a list, and the names of their markers. */
const listCodes = { TOC: 'toc', LOF: 'lof', LOT: 'lot', LOL: 'lol' } as const;

type ListCode = keyof typeof listCodes;

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
