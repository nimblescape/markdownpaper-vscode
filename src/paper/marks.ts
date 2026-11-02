// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The marks of a paper document that the format steps, the checks and the plugins of the editor share: the name of the
 * comment of the database of the sources, the form of the identifier of a source, the marks of an argument to research
 * ([R-CITE-001](../../docs/requirements.md#r-cite-001), [R-CITE-002](../../docs/requirements.md#r-cite-002)), and the
 * names of the markers of the lists of the special sections ([R-GEN-008](../../docs/requirements.md#r-gen-008)). The
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
