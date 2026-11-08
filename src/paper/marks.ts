// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The marks of a paper document that the format steps, the checks and the plugins of the editor share: the name of the
 * comment of the database of the sources, the form of the identifier of a source, the marks of an argument to research and
 * their places in a selected argument
 * ([R-CITE-001](../../docs/requirements.md#r-cite-001), [R-CITE-002](../../docs/requirements.md#r-cite-002)), the
 * names of the markers of the lists of the special sections ([R-GEN-008](../../docs/requirements.md#r-gen-008)), and the
 * text of a link to a heading with the ID of a heading ([R-REN-009](../../docs/requirements.md#r-ren-009)). The
 * module imports nothing, so that the bundle of the plugins of the editor holds no more than these marks.
 */

/** sourcesName is the name of the comment of the database in its first line. */
export const sourcesName = 'nimblescape-sources';

/** idPattern matches the identifier of a source: a letter or a digit, then letters, digits, `_`, `-`, `.` and `:`. */
export const idPattern = /^[\p{L}\p{N}][\p{L}\p{N}_.:-]*$/u;

/**
 * researchText asks an AI agent for the evidence of the argument from the start marker `researchMark` to it, or of the
 * sentence before it without a start marker ([R-CITE-002](../../docs/requirements.md#r-cite-002)).
 */
export const researchText = '(RESEARCH)';
export const researchMark = '<!--[research-->';

/** listCodes are the codes of the sections with a list, and the names of their markers, for example `<!-- toc -->`. */
export const listCodes = { TOC: 'toc', LOF: 'lof', LOT: 'lot', LOL: 'lol' } as const;

/**
 * headingLinkText matches the text of a link to a heading that the format step writes anew
 * ([R-REN-009](../../docs/requirements.md#r-ren-009)): a word and the number or the label of the heading, such as
 * `Kapitel 2.1` or `Anhang B`. It is `referenceText` of the layouts, here so that the plugins of the editor need no
 * more than this module.
 */
export const headingLinkText = /^(\p{L}+\.?)\s+(?:[A-Z]?\d+(?:\.\d+)*|[A-Z])$/u;

/**
 * headingSlug returns the ID of a heading by the text that it shows, before a number for a heading of the same ID, as
 * GitHub and the renderer give it.
 * @param text - The text of the heading.
 */
export const headingSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');

/** closingMark matches the punctuation mark at the end of a selected argument, before which its citation goes. */
const closingMark = /[.,;:!?]$/;

/** ResearchEdit is the place of the start marker and of `(RESEARCH)` in a selected argument, as offsets in its text. */
export interface ResearchEdit {
  start: number;
  end: number;
}

/**
 * researchEdit returns where `/research` puts the start marker and `(RESEARCH)` in a selected argument
 * ([R-CITE-002](../../docs/requirements.md#r-cite-002)): the marker before its first character, and `(RESEARCH)` after
 * its last word, before a punctuation mark at its end, where the citation goes. It returns the reason as a text when
 * the selection is no argument: no text, more than one paragraph, or a mark of `/research` in it.
 * @param selected - The selected text.
 */
export function researchEdit(selected: string): ResearchEdit | string {
  const start = selected.length - selected.trimStart().length;
  let argument = selected.slice(start).trimEnd();
  if (argument === '') {
    return 'Select the argument to research, then type /research.';
  }
  if (/\n[ \t]*\r?\n/.test(argument)) {
    return 'Select an argument in one paragraph.';
  }
  if (argument.includes(researchMark) || argument.includes(researchText)) {
    return 'The selected text has a mark of /research already.';
  }
  if (closingMark.test(argument)) {
    argument = argument.slice(0, -1).trimEnd();
  }
  return argument === '' ? 'Select the argument to research, then type /research.' : { start, end: start + argument.length };
}
