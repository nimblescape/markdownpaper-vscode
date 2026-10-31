// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The format of a paper document ([R-CLI-002](../../docs/requirements.md#r-cli-002)): the steps of the paper in their
 * order, the same in VS Code and in `markdownpaper format`. First the citations and the reference list
 * ([R-CITE-004](../../docs/requirements.md#r-cite-004)), whose new section the table of contents then lists, then the
 * numbers of the headings in the links to them ([R-REN-009](../../docs/requirements.md#r-ren-009)), then the lists of
 * the special sections ([R-REN-004](../../docs/requirements.md#r-ren-004)). The module uses no API of VS Code.
 */

import { writeCitations } from './citations';
import type { CitationStyle } from './csl';
import { writeHeadingLinks } from './headingLinks';
import type { Layout } from './layout';
import { writeLists } from './lists';

/**
 * formatPaper returns the lines of a paper document with its citations, its reference list, the numbers of the
 * headings in the links to them and its lists written. A citation style that citeproc-js cannot apply leaves the
 * citations as they are; the checks name the problem.
 * @param lines - The lines of the file.
 * @param layout - The layout of the file, with the language of its front matter.
 * @param style - The citation style of the layout.
 */
export function formatPaper(lines: readonly string[], layout: Layout, style: CitationStyle): string[] {
  let cited: string[];
  try {
    cited = writeCitations(lines, layout, style);
  } catch {
    cited = [...lines];
  }
  return writeLists(writeHeadingLinks(cited, layout), layout);
}
