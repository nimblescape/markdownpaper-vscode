// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The parts of citeproc-js that src/paper/csl.ts uses. The package has no types of its own.
declare module 'citeproc' {
  /** Sys gives the engine the CSL locales and the metadata of the sources. */
  interface Sys {
    retrieveLocale(language: string): string | undefined;
    retrieveItem(id: string): object | undefined;
  }

  /** CitationItem is one source of a citation, with the place in the source and the form. */
  interface CitationItem {
    id: string;
    locator?: string;
    label?: string;
    'author-only'?: boolean;
    'suppress-author'?: boolean;
  }

  /** Engine applies one CSL style in one language. */
  class Engine {
    constructor(sys: Sys, style: string, language?: string, forceLanguage?: boolean);
    opt: { development_extensions: Record<string, boolean> };
    setOutputFormat(format: string): void;
    updateItems(ids: string[]): void;
    makeCitationCluster(items: CitationItem[]): string;
    makeBibliography(): false | [{ entry_ids: string[][] }, string[]];
    getTerm(term: string, form?: string, plural?: boolean): string;
  }

  /** Format is an output format of the engine: a function or a text for each formatting of the style. */
  type Format = Record<string, unknown>;

  const Output: { Formats: Record<string, Format> };
}
