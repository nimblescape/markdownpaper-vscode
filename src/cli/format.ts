// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The one formatter of a paper on the command line ([R-CLI-002](../../docs/requirements.md#r-cli-002)): first the
 * formatter of Markdown Notes, `formatMarkdown` of its library `@nimblescape/markdownnotes`, then the steps of the
 * paper. The steps of the paper can write what the formatter of Markdown Notes reads, such as the markers of a list of
 * the special sections, so both run again while one of them changes the text, at most three rounds, as Markdown Notes
 * runs the format steps of other extensions in VS Code. Then a second format keeps the text as it is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Layout } from '@nimblescape/markdownlayout';
import { formatMarkdown } from '@nimblescape/markdownnotes';
import type { CitationStyle } from '../paper/csl';
import { formatPaper } from '../paper/format';

/** byteOrderMark is the byte order mark that a text can start with. */
const byteOrderMark = '﻿';

/**
 * sourceOf returns the reader of the files of the listings of a Markdown file for the formatter of Markdown Notes: a
 * path relative to the folder of the file, with `%` escapes for spaces and other characters, as the command
 * `markdownnotes format` reads it.
 * @param file - The absolute path of the Markdown file.
 */
const sourceOf =
  (file: string) =>
  (relative: string): string | undefined => {
    try {
      return fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(relative)), 'utf8');
    } catch {
      return undefined;
    }
  };

/**
 * same returns true when two lists of lines are the same.
 * @param a - The first list.
 * @param b - The second list.
 */
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((line, index) => line === b[index]);

/**
 * formatDocument returns the text of a paper document after the formatter of Markdown Notes and the steps of the paper,
 * with the line breaks and the byte order mark of the text.
 * @param text - The text of the file.
 * @param file - The absolute path of the file, for the files of its listings.
 * @param layout - The layout of the file, with the language of its front matter.
 * @param style - The citation style of the layout.
 */
export function formatDocument(text: string, file: string, layout: Layout, style: CitationStyle): string {
  const bom = text.startsWith(byteOrderMark) ? byteOrderMark : '';
  const body = text.slice(bom.length);
  const options = { source: sourceOf(file) };
  let changed = formatMarkdown(body.split(/\r\n|\r|\n/), options);
  for (let round = 0; round < 3; round++) {
    const stepped = formatPaper(changed, layout, style);
    if (same(stepped, changed)) {
      break;
    }
    changed = formatMarkdown(stepped, options);
    if (same(changed, stepped)) {
      break;
    }
  }
  return bom + changed.join(body.includes('\r\n') ? '\r\n' : '\n');
}
