// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The format step of the paper that writes the numbers of the headings into the links to them
 * ([R-REN-009](../../docs/requirements.md#r-ren-009)): a link whose text is a word and a number, such as
 * `[Kapitel 2.1](#methoden)`, gets the word of the link and the number of its heading by the rules of the layout, and a
 * link to an appendix its label, such as `[Anhang B](#daten)`. So the file shows the numbers of the pages. The
 * renderer writes the same text on the pages; the formatter of Markdown Notes writes the numbers of the captions and of
 * the links to figures, tables and listings. The module uses no API of VS Code.
 */

import { bodyOf, readFrontMatter } from './frontMatter';
import type { Layout } from './layout';
import { decodedTarget, type Heading, referenceText, renderBody } from './markdown';

/** link matches a link to a place in the file, not an image: its text, its target and its title. */
const link = /(?<!!)\[([^[\]\n]+)\]\(#([^()\s]+)(\s+"[^"]*")?\)/g;

/**
 * outsideCode returns a line with an edit of its parts outside code spans.
 * @param line - The line.
 * @param edit - The edit of a part.
 */
const outsideCode = (line: string, edit: (part: string) => string): string =>
  line
    .split(/(`+)(.*?)\1/)
    .map((part, index, parts) => (index % 3 === 0 ? edit(part) : index % 3 === 1 ? `${part}${parts[index + 1]}${part}` : ''))
    .join('');

/**
 * labelOf returns the text of a link to a heading, as the pages show it: the label of an appendix, or the word of the
 * link and the number of the heading; undefined for a heading without a number.
 * @param text - The text of the link, a word and a number.
 * @param heading - The heading.
 */
function labelOf(text: string, heading: Heading): string | undefined {
  if (heading.appendix) {
    return heading.number;
  }
  return heading.number ? `${referenceText.exec(text)?.[1] ?? ''} ${heading.number}` : undefined;
}

/**
 * writeHeadingLinks returns the lines of a Markdown file with the current numbers of the headings in the links to them.
 * A link in a code span, a fenced code block or an HTML comment keeps its text, as does a link with other words.
 * @param lines - The lines of the file.
 * @param layout - The layout of the file, with the language of its front matter.
 */
export function writeHeadingLinks(lines: readonly string[], layout: Layout): string[] {
  const text = lines.join('\n');
  const frontMatter = readFrontMatter(text);
  const body = renderBody(bodyOf(text, frontMatter), layout);
  const headings = new Map(body.headings.flatMap((heading) => [[heading.id, heading] as const, ...(heading.anchor ? [[heading.anchor, heading] as const] : [])]));
  let fence: string | undefined;
  let comment = false;
  return lines.map((line, index) => {
    if (frontMatter && index <= frontMatter.end) {
      return line;
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = undefined;
      }
      return line;
    }
    if (marker) {
      fence = marker;
      return line;
    }
    // The parts outside HTML comments, which can span lines, such as the database of the sources.
    const parts = line.split(/(<!--|-->)/);
    let result = '';
    for (const part of parts) {
      if (part === '<!--' || part === '-->') {
        comment = part === '<!--';
        result += part;
      } else {
        result += comment
          ? part
          : outsideCode(part, (piece) =>
              piece.replace(link, (whole, words: string, target: string, title = '') => {
                const heading = headings.get(decodedTarget(target));
                const label = heading && referenceText.test(words.trim()) ? labelOf(words.trim(), heading) : undefined;
                return label === undefined ? whole : `[${label}](#${target}${title})`;
              }),
            );
      }
    }
    return result;
  });
}
