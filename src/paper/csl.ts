// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The citation styles ([R-CITE-003](../../docs/requirements.md#r-cite-003)): citeproc-js applies a style of the
 * Citation Style Language (CSL) to the metadata of the sources in CSL JSON, and writes the text of a citation and of
 * an entry of the reference list as Markdown, for example:
 *
 * ```markdown
 * Kriesche, J., & Kahlert, J. (2019). *Lehrer werden mit Methode*. Julius Klinkhardt.
 * Kriesche & Kahlert, 2019, S. 10 · Kriesche und Kahlert (2019)
 * ```
 *
 * The field `citationStyle` of layout.json names a built-in style, such as `apa7`, or a CSL file of the layout
 * folder, such as `pht-apa7.csl`. The built-in style and the CSL locales of the languages are the files of csl/,
 * which the build puts into the bundle. The module uses no API of VS Code.
 */

import * as CSL from 'citeproc';
import apa from '../../csl/apa.csl?raw';
import deAT from '../../csl/locales-de-AT.xml?raw';
import deDE from '../../csl/locales-de-DE.xml?raw';
import enGB from '../../csl/locales-en-GB.xml?raw';
import enUS from '../../csl/locales-en-US.xml?raw';
import { type Layout, layoutFile, type Problem, relativeFile } from './layout';

/** Name is a name of a person or a group in CSL JSON. */
export interface Name {
  family?: string;
  given?: string;
  'non-dropping-particle'?: string;
  'dropping-particle'?: string;
  suffix?: string;
  literal?: string;
}

/** CslDate is a date in CSL JSON: its parts (year, month, day) or a text. */
export interface CslDate {
  'date-parts'?: (number | string)[][];
  literal?: string;
  raw?: string;
}

/** Source is the metadata of a source in CSL JSON, the format of Zotero, Mendeley and Pandoc. */
export interface Source {
  id: string;
  type?: string;
  title?: string;
  author?: Name[];
  editor?: Name[];
  issued?: CslDate;
  accessed?: CslDate;
  [field: string]: unknown;
}

/** Form is the form of a citation: in parentheses after a statement, or as a part of the sentence. */
export type Form = 'parenthetical' | 'narrative';

/** Cite is one citation of one source: its form and the place in the source, such as the CSL term page and 3. */
export interface Cite {
  id: string;
  form: Form;
  label?: string;
  locator?: string;
}

/** CitationStyle is a CSL style: its name in layout.json and the XML of the style. */
export interface CitationStyle {
  name: string;
  xml: string;
}

/** defaultStyle is the style of a layout that names none. */
export const defaultStyle = 'apa7';

/** builtinStyles are the styles that a layout names without a file: apa7 is "APA Style 7th edition" of the CSL. */
export const builtinStyles: Readonly<Record<string, string>> = { apa7: apa };

/**
 * citationStyleOf reads the citation style that a layout names: a built-in style, or a CSL file of the layout folder.
 * A layout that names none, or a style that cannot be read, gets the built-in style apa7, with a warning for the
 * latter.
 * @param read - Returns the bytes of a file by its URL, or undefined when it does not exist.
 * @param layout - The layout.
 */
export async function citationStyleOf(read: (url: string) => Promise<Uint8Array | undefined>, layout: Layout): Promise<{ style: CitationStyle; problems: Problem[] }> {
  const name = layout.citationStyle?.trim() || defaultStyle;
  const fallback = { name: defaultStyle, xml: builtinStyles[defaultStyle] };
  const warning = (message: string) => ({ style: fallback, problems: [{ severity: 'warning' as const, message, file: `${layout.folder}${layoutFile}` }] });
  if (builtinStyles[name]) {
    return { style: { name, xml: builtinStyles[name] }, problems: [] };
  }
  if (!/\.csl$/i.test(name) || !relativeFile(name)) {
    return warning(`The layout "${layout.id}" names the citation style "${name}", which is neither a built-in style (${Object.keys(builtinStyles).join(', ')}) nor a .csl file of the layout folder; the layout uses ${defaultStyle}.`);
  }
  const bytes = await read(`${layout.folder}${name}`);
  if (!bytes) {
    return warning(`The layout "${layout.id}" names the citation style ${name}, which does not exist; the layout uses ${defaultStyle}.`);
  }
  const xml = new TextDecoder().decode(bytes);
  if (!/<style\b[^>]*xmlns="http:\/\/purl\.org\/net\/xbiblio\/csl"/.test(xml)) {
    return warning(`The citation style ${name} of the layout "${layout.id}" is no CSL style; the layout uses ${defaultStyle}.`);
  }
  return { style: { name, xml }, problems: [] };
}

/** locales are the CSL locales of the bundle; a language without its own locale takes the one of its first part. */
const locales: Readonly<Record<string, string>> = { 'de-AT': deAT, 'de-DE': deDE, 'en-GB': enGB, 'en-US': enUS };
const firstParts: Readonly<Record<string, string>> = { de: 'de-DE', en: 'en-US' };

/**
 * localeOf returns the CSL locale for a language tag, such as de-AT, or en-US when the bundle has none for it.
 * @param language - The language tag.
 */
export function localeOf(language: string): string {
  const exact = Object.keys(locales).find((tag) => tag.toLowerCase() === language.toLowerCase());
  return exact ?? firstParts[language.split('-')[0].toLowerCase()] ?? 'en-US';
}

/**
 * markdownEscape returns a text with a backslash before the characters that Markdown reads as markup.
 * @param text - The text.
 */
const markdownEscape = (text: string): string => text.replace(/[\\*_[\]<`]/g, (character) => `\\${character}`);

/**
 * unescape returns a text without the backslashes of markdownEscape, for an address that stays as it is.
 * @param text - The escaped text.
 */
const unescape = (text: string): string => text.replace(/\\([\\*_[\]<`])/g, '$1');

// The output format "markdown" of the engine: the text format of citeproc-js, with italics and bold in Markdown and
// the escaped characters of Markdown. Addresses (URL and DOI) stay as they are.
CSL.Output.Formats.markdown = {
  ...CSL.Output.Formats.text,
  text_escape: (text: string | undefined) => markdownEscape(text ?? ''),
  '@font-style/italic': (_state: unknown, text: string) => `*${text}*`,
  '@font-style/oblique': (_state: unknown, text: string) => `*${text}*`,
  '@font-weight/bold': (_state: unknown, text: string) => `**${text}**`,
  '@URL/true': (_state: unknown, text: string) => unescape(text),
  '@DOI/true': (_state: unknown, text: string) => unescape(text),
};

/**
 * tidy returns the text of the engine for a Markdown file: one italic part for italic parts that only a comma
 * separates, as APA writes the journal and its volume (`*Behavioral Science, 9*`), and no space at the edges.
 * @param text - The text of the engine.
 */
const tidy = (text: string): string => {
  let result = text.trim();
  for (let joined = result.replace(/\*([^*\n]+)\*, \*([^*\n]+)\*/g, '*$1, $2*'); joined !== result; joined = result.replace(/\*([^*\n]+)\*, \*([^*\n]+)\*/g, '*$1, $2*')) {
    result = joined;
  }
  return result;
};

/**
 * itemOf returns the metadata of a source as citeproc-js reads it: numbers outside of dates as texts.
 * @param source - The source.
 */
const itemOf = (source: Source): Source =>
  Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])) as Source;

/** Engines are the engines of citeproc-js by style and language, with the sources that their engine reads. */
interface Cached {
  engine: CSL.Engine;
  sources: Map<string, Source>;
}
const engines = new Map<string, Cached>();

/**
 * engineOf returns the engine of a style in a language, made once.
 * @param style - The style.
 * @param language - The language tag of the document.
 */
function engineOf(style: CitationStyle, language: string): Cached {
  const locale = localeOf(language);
  const key = `${locale}\n${style.xml}`;
  let cached = engines.get(key);
  if (!cached) {
    const sources = new Map<string, Source>();
    const engine = new CSL.Engine(
      {
        retrieveLocale: (tag) => locales[tag] ?? locales[firstParts[tag.toLowerCase()] ?? ''],
        retrieveItem: (id) => sources.get(id),
      },
      style.xml,
      locale,
      true,
    );
    // The engine gives the addresses to the formatters @URL and @DOI, which keep them as they are.
    engine.opt.development_extensions.wrap_url_and_doi = true;
    engine.setOutputFormat('markdown');
    cached = { engine, sources };
    engines.set(key, cached);
  }
  return cached;
}

/** Cited is the text of the citations and the entries of the reference list in one style. */
export interface Cited {
  /** citations are the texts of the cites, in their order: without the parentheses of the style for a parenthetical one. */
  citations: string[];
  /** entries are the entries of the cited sources, in the order of the style. */
  entries: { id: string; text: string }[];
}

/**
 * cite writes the text of citations and the entries of the cited sources in a style. A parenthetical citation is the
 * text in the parentheses, because a link stands for each source and the parentheses stand outside the links. A
 * narrative citation is the names and, in parentheses, the year and the place; it joins the last two names with the
 * word "and" of the language, as APA writes a citation in the sentence (Festman und Schwieter, 2019).
 * @param style - The style.
 * @param language - The language tag of the document, which chooses the CSL locale.
 * @param sources - The sources of the document; cites of an unknown source get an empty text.
 * @param cites - The citations, in the order of the document.
 * @throws An Error when the style is no CSL style.
 */
export function cite(style: CitationStyle, language: string, sources: readonly Source[], cites: readonly Cite[]): Cited {
  const { engine, sources: known } = engineOf(style, language);
  known.clear();
  for (const source of sources) {
    known.set(source.id, itemOf(source));
  }
  const ids = [...new Set(cites.map((one) => one.id).filter((id) => known.has(id)))];
  engine.updateItems(ids);
  const and = engine.getTerm('and');
  const citations = cites.map((one) => {
    if (!known.has(one.id)) {
      return '';
    }
    const place = one.locator ? { locator: one.locator, label: one.label ?? 'page' } : {};
    if (one.form === 'narrative') {
      const names = tidy(engine.makeCitationCluster([{ id: one.id, 'author-only': true }])).replace(/ & (?!.* & )/, ` ${and} `);
      const year = tidy(engine.makeCitationCluster([{ id: one.id, 'suppress-author': true, ...place }]));
      return `${names} ${/^\(.*\)$/.test(year) ? year : `(${year})`}`;
    }
    const text = tidy(engine.makeCitationCluster([{ id: one.id, ...place }]));
    return /^\(.*\)$/.test(text) ? text.slice(1, -1) : text;
  });
  const bibliography = ids.length > 0 ? engine.makeBibliography() : false;
  const entries = bibliography ? bibliography[1].map((text, index) => ({ id: bibliography[0].entry_ids[index][0], text: tidy(text) })) : [];
  return { citations, entries };
}
