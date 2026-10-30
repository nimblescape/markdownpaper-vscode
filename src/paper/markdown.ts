// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The text of the pages: markdown-it turns the Markdown text after the front matter into HTML, and one rule of the
 * renderer changes the tokens of markdown-it before the HTML is written ([R-REN-002](../../docs/requirements.md#r-ren-002)
 * to [R-REN-006](../../docs/requirements.md#r-ren-006)):
 *
 * - The notes of nimblescape Markdown Notes are not for the reader: the rule removes each footnote whose label is the
 *   label of a note (`note-` and four small letters or digits), its references, and the start markers of the notes
 *   with their `<wbr>`, as version 1 of the format of the notes defines them.
 * - Each other footnote becomes an element `<span class="footnote">` at the place of its first reference, which
 *   Paged.js puts at the foot of the page of that reference (`float: footnote`).
 * - The headings get the ID that GitHub gives them, so plain Markdown links to them work, and a number such as 1.1
 *   when the layout numbers them. A heading with `{-}` at its end,
 *   the heading of a special section (TOC, LOF, LOT, LOL, BIB, ADT, AST, ACC, FWD, APX: by its words in the language
 *   of the layout, or by a marker such as `{BIB}`), and a heading that a pattern of the layout names get none, nor do
 *   the headings below them; the special sections of `headings.numberedSections` of the layout get a number as other
 *   chapters do.
 * - The captions carry their numbers in the file, as the formatter of Markdown Notes writes them, and the pages keep
 *   them; only a caption without a number gets the next number of its kind. A paragraph "Figure 1: …" directly before
 *   an image alone in its paragraph is the caption of the figure, above the image; an image without it is a figure
 *   without a caption. A paragraph "Table 1: …" directly before a table is the caption of the table. A paragraph
 *   "Listing 1: …" before a listing of Markdown Notes, a fenced code block with the comment of its source, is the
 *   caption of the listing, with the cite of its source after it, and the code gets the numbers of its lines when
 *   the layout asks for them ([R-REN-011](../../docs/requirements.md#r-ren-011)).
 * - The section of the table of contents (TOC), of the list of figures (LOF), of the list of tables (LOT) or of the
 *   list of listings (LOL) shows the list that the file holds between the markers of the section, such as
 *   `<!-- toc -->` and `<!-- /toc -->`, which the formatter writes, with the page of each entry; a section without
 *   them gets the list of the renderer. The reference list (BIB) gets no soft hyphens, unless the layout asks for them
 *   with `references.hyphenate`.
 * - The headings of the level 2 in the appendix part, after the heading "Anhang" or "Appendix", are the appendices
 *   A, B, … (one appendix has no letter), whose figures, tables and listings are numbered A1, A2, … as APA 7 numbers
 *   them.
 * - The document has up to three parts, each from a heading of the level 1 on, in its own element: the front part
 *   (`div.paper-part.paper-front`), the chapters of the front matter (ADT, AST, ACC, FWD, TOC, LOF, LOT, LOL) before the
 *   first other chapter; the body (`div.paper-part.paper-body`) with the chapters; and the appendix part
 *   (`div.paper-part.paper-appendix`). A layout can give each part its own pages, for example without a page number
 *   in the front part. A special section of the front part gets no number, also when the layout numbers its kind
 *   ([R-REN-013](../../docs/requirements.md#r-ren-013)).
 * - A block quote whose first line is the mark of an alert of GitHub, such as `> [!NOTE]`, becomes the element of an
 *   alert as GitHub writes it, `<div class="markdown-alert markdown-alert-note">` with its title, so a layout can draw
 *   it as a box, for example the blue box of a hint of a template ([R-REN-014](../../docs/requirements.md#r-ren-014)).
 * - Each block names its line in the file (`data-line`), so that a click on a page shows that line in the editor.
 *
 * `paperPlugin` adds the rule to a markdown-it instance: to the one of `renderBody` for the PDF and the command line, and
 * to the one of the Markdown preview of VS Code ([R-PRV-005](../../docs/requirements.md#r-prv-005)), where other
 * plugins add their rules too. The rule works only when the environment of the rendering has `nimblescapePaper`, so a
 * notes document keeps its preview as it is. The module uses no API of VS Code.
 */

import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { hyphenateHtml } from './hyphenate';
import { type Layout, type Problem, type SectionCode, sectionCodes, type Terms } from './layout';
import { escapeHtml } from './template';

/** noteLabel matches the label of a note of nimblescape Markdown Notes. */
export const noteLabel = /^note-[a-z0-9]{4}$/;

/** noteStart matches the start marker of a note: an HTML comment with "[", the label and an optional color. */
const noteStart = /^<!--\[note-[a-z0-9]{4}(?:\s[^>]*)?-->$/;

/**
 * researchStart matches the start marker of an argument for which an AI agent researches the evidence
 * ([R-CITE-002](../../docs/requirements.md#r-cite-002)).
 */
export const researchStart = /^<!--\[research-->$/;

/** startMarker tells whether a token is the start marker of a note or of an argument to research. */
const startMarker = (token: Token | undefined): boolean => token?.type === 'html_inline' && (noteStart.test(token.content) || researchStart.test(token.content));

/** wbr matches the element <wbr> that stands before a start marker. */
const wbr = /^<wbr\s*\/?>$/i;

/**
 * headingMarker matches a marker at the end of a heading: `{-}` or `{.unnumbered}` for a heading without a number, or
 * the code of a special section, for example `{BIB}`, for a heading whose words are not the words of the language.
 */
const headingMarker = new RegExp(`\\s*\\{(-|\\.unnumbered|${sectionCodes.join('|')})\\}\\s*$`);

/** generatedLists are the special sections that show a list with the page of each entry. */
const generatedLists = ['TOC', 'LOF', 'LOT', 'LOL'] as const;

type GeneratedList = (typeof generatedLists)[number];

/**
 * frontSections are the special sections of the front matter: the chapters of the level 1 with these codes before the
 * first other chapter are the front part of the document.
 */
const frontSections: readonly SectionCode[] = ['ADT', 'AST', 'ACC', 'FWD', 'TOC', 'LOF', 'LOT', 'LOL'];

/** Part is a part of the document: the front matter, the body with the chapters, or the appendix part. */
export type Part = 'front' | 'body' | 'appendix';

/** byHand matches a heading that starts with a number, such as "1 Introduction" or "2.3. Method". */
const byHand = /^\d+(?:\.\d+)*\.?\s/;

/** Heading is a heading of the text. */
export interface Heading {
  level: number;
  id: string;
  /** number is the number of the heading, for example 1.2, or the label of an appendix, else empty. */
  number: string;
  /** text is the text of the heading without its number. */
  text: string;
  /** section is the code of the special section that the heading starts, if any; APX-A, APX-B for an appendix. */
  section?: string;
  /** appendix is true for the heading of one appendix, whose number is its label, for example "Anhang A". */
  appendix?: boolean;
  /** part is the part of the document that the heading is in ([R-REN-013](../../docs/requirements.md#r-ren-013)). */
  part?: Part;
  /** anchor is the ID of an anchor at the end of the heading, `<a id="sec-methods"></a>`, if any. */
  anchor?: string;
  line: number;
}

/** Caption is the caption of a figure, of a table or of a listing. */
export interface Caption {
  id: string;
  /** label is the word and the number, for example "Abbildung 1". */
  label: string;
  /** text is the text of the caption without its label. */
  text: string;
  line: number;
}

/** Body is the HTML of the text and what the renderer found in it. */
export interface Body {
  html: string;
  headings: Heading[];
  figures: Caption[];
  tables: Caption[];
  listings: Caption[];
  /** footnotes is the number of the footnotes of the pages; notes is the number of the removed notes. */
  footnotes: number;
  notes: number;
  problems: Problem[];
}

/** Entry is an entry of the list of a special section in the file: the target of its link and the text of the link. */
export interface Entry {
  href: string;
  text: string;
}

/** Found is what the rule finds in the tokens, for one rendering. */
export interface Found extends Omit<Body, 'html'> {
  /** lists are the entries of the lists that the file holds between the markers of their sections. */
  lists: Partial<Record<(typeof generatedLists)[number], Entry[]>>;
  hyphenate?: (text: string) => string;
}

/** found returns an empty Found. */
export const emptyFound = (): Found => ({ headings: [], figures: [], tables: [], listings: [], lists: {}, footnotes: 0, notes: 0, problems: [] });

/** listMarker matches a marker of the list of a special section: `<!-- toc -->` at its start, `<!-- /toc -->` at its end. */
const listMarker = /^\s*<!--\s*(\/?)(toc|lof|lot|lol)\s*-->\s*$/i;

/**
 * captionPattern returns the pattern of the start of a caption, such as "Table 2: " or "Tabelle: ", with the number as
 * its group.
 * @param words - The words of the caption: the English word and the word of the language.
 */
function captionPattern(...words: string[]): RegExp {
  const alternatives = [...new Set(words)].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`^(?:${alternatives})(?:\\s+([A-Z]?\\d+))?\\s*:\\s*`, 'i');
}

/** PaperEnv is what the rule needs in the environment of a rendering, as `nimblescapePaper`. */
export interface PaperEnv {
  layout: Layout;
  found: Found;
}

/** paperTokenType is the type of the token that the rule puts first, with the PaperEnv as its meta. */
export const paperTokenType = 'nimblescape_paper';

/** MarkdownPlugin is a plugin of markdown-it, as `extendMarkdownIt` of an extension of VS Code gives it. */
export type MarkdownPlugin = (md: MarkdownIt) => MarkdownIt | void;

/**
 * slug returns the ID of a heading from its text.
 * @param text - The text.
 */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-') || 'section';

/**
 * plainText returns the text of inline tokens without their markup.
 * @param tokens - The inline tokens.
 */
function plainText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') {
        return token.content;
      }
      if (token.type === 'softbreak' || token.type === 'hardbreak') {
        return ' ';
      }
      if (token.type === 'image') {
        return plainText(token.children ?? []);
      }
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * headingSource returns the text of the inline tokens of a heading as GitHub reads it for the ID of the heading: the
 * text and the code, with the spaces as they are, also the space before an anchor at the end, and without the text of
 * images.
 * @param tokens - The inline tokens of the heading.
 */
function headingSource(tokens: readonly Token[]): string {
  return tokens.map((token) => (token.type === 'text' || token.type === 'code_inline' ? token.content : token.type === 'softbreak' ? ' ' : '')).join('');
}

/** anchorTag matches the anchor of a figure or a table, `<a id="tab-grades"></a>`, as one token or as its start tag. */
const anchorTag = /^<a\s+(?:id|name)\s*=\s*"([^"<>]+)"\s*>\s*(<\/a\s*>)?$/i;

/**
 * trailingAnchor returns the ID of the anchor at the end of an inline text, as the slash commands `/figure` and
 * `/table` of nimblescape Markdown Notes write it after an image or a caption, and the index of its first token.
 * @param tokens - The inline tokens.
 */
function trailingAnchor(tokens: readonly Token[]): { id: string; start: number } | undefined {
  let end = tokens.length;
  while (end > 0 && (tokens[end - 1].type === 'softbreak' || (tokens[end - 1].type === 'text' && tokens[end - 1].content.trim() === ''))) {
    end--;
  }
  const last = tokens[end - 1];
  if (last?.type !== 'html_inline') {
    return undefined;
  }
  const whole = anchorTag.exec(last.content);
  if (whole?.[2]) {
    return { id: whole[1], start: end - 1 };
  }
  const open = end > 1 && tokens[end - 2].type === 'html_inline' && /^<\/a\s*>$/i.test(last.content) ? anchorTag.exec(tokens[end - 2].content) : null;
  return open && !open[2] ? { id: open[1], start: end - 2 } : undefined;
}

/**
 * imageOf returns the children of a paragraph with only an image, without the anchor at its end, and the anchor, or
 * undefined for another block.
 * @param tokens - The tokens of the text.
 * @param index - The index of the start of the paragraph.
 */
function imageOf(tokens: readonly Token[], index: number): { kept: Token[]; anchor?: { id: string; start: number } } | undefined {
  if (tokens[index]?.type !== 'paragraph_open' || tokens[index + 1]?.type !== 'inline') {
    return undefined;
  }
  const all = tokens[index + 1].children ?? [];
  const anchor = trailingAnchor(all);
  const kept = anchor ? all.slice(0, anchor.start) : all;
  const children = kept.filter((child) => !(child.type === 'text' && child.content.trim() === '') && child.type !== 'softbreak');
  return children.length === 1 && children[0].type === 'image' ? { kept, anchor } : undefined;
}

/**
 * withoutTrailingSpace returns the inline tokens without the spaces and line breaks at their end.
 * @param tokens - The inline tokens.
 */
function withoutTrailingSpace(tokens: Token[]): Token[] {
  const result = [...tokens];
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (last.type === 'softbreak' || (last.type === 'text' && last.content.trim() === '')) {
      result.pop();
    } else {
      if (last.type === 'text') {
        last.content = last.content.trimEnd();
      }
      break;
    }
  }
  return result;
}

/**
 * referenceText matches the text of a link to a figure, a table or a heading that the renderer writes anew: a word and
 * a number, such as "Abbildung 1", "Tabelle A1", "Kapitel 2.1" or "Anhang B".
 */
const referenceText = /^(\p{L}+\.?)\s+(?:[A-Z]?\d+(?:\.\d+)*|[A-Z])$/u;

/**
 * matches tells whether the text of a heading is one of the terms, without regard to case.
 * @param text - The text of the heading.
 * @param terms - The terms.
 */
const matches = (text: string, terms: readonly string[]): boolean => terms.some((term) => term.toLocaleLowerCase() === text.toLocaleLowerCase());

/**
 * decodedTarget returns the target of a link without the escapes that markdown-it writes for the letters outside
 * ASCII, such as `erkl%C3%A4rung` for `erklärung`; a target with a wrong escape stays as it is.
 * @param href - The target, without "#".
 */
function decodedTarget(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/**
 * sectionOf returns the code of the special section of a heading: the code of its marker, else the code whose words
 * are its text. The appendix part and the reference list are chapters, of the level 1.
 * @param text - The text of the heading, without its marker.
 * @param level - The level of the heading.
 * @param marker - The marker of the heading, if any.
 * @param terms - The terms of the language.
 */
function sectionOf(text: string, level: number, marker: string | undefined, terms: Terms): SectionCode | undefined {
  if (marker && (sectionCodes as readonly string[]).includes(marker)) {
    return marker as SectionCode;
  }
  const code = sectionCodes.find((candidate) => matches(text, terms.sections[candidate]));
  return code && (level === 1 || (code !== 'APX' && code !== 'BIB')) ? code : undefined;
}

/**
 * letter returns the letter of the appendix with an index: A, B, …, Z, AA, AB, ….
 * @param index - The index, from 0.
 */
const letter = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : letter(Math.floor(index / 26) - 1) + letter(index % 26));

/**
 * html returns a new token of inline HTML.
 * @param state - The state of the rule.
 * @param content - The HTML.
 */
function html(state: StateCore, content: string, block = false): Token {
  const token = new state.Token(block ? 'html_block' : 'html_inline', '', 0);
  token.content = content;
  return token;
}

/**
 * removeNotes removes the notes from the tokens: their references and start markers, and their definitions, and
 * returns the number of the removed notes. It also removes the start markers of the arguments to research.
 * @param tokens - The tokens of the text.
 */
function removeNotes(tokens: Token[]): number {
  const labels = new Set<string>();
  for (const token of tokens) {
    if (token.type !== 'inline' || !token.children) {
      continue;
    }
    token.children = token.children.filter((child, index, children) => {
      if (child.type === 'footnote_ref' && noteLabel.test(child.meta?.label ?? '')) {
        labels.add(child.meta.label);
        return false;
      }
      if (startMarker(child)) {
        return false;
      }
      return !(child.type === 'html_inline' && wbr.test(child.content) && startMarker(children[index + 1]));
    });
  }
  // The definitions of the notes in the block of the footnotes at the end.
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type === 'footnote_open' && noteLabel.test(tokens[index].meta?.label ?? '')) {
      const end = tokens.findIndex((token, at) => at > index && token.type === 'footnote_close');
      tokens.splice(index, end - index + 1);
      index--;
    }
  }
  return labels.size;
}

/**
 * placeFootnotes moves the text of each footnote to its first reference, as an element `<span class="footnote">`,
 * and gives each later reference the number of the footnote. It removes the block of the footnotes.
 * @param state - The state of the rule.
 * @returns The number of the footnotes.
 */
function placeFootnotes(state: StateCore): number {
  const tokens = state.tokens;
  const start = tokens.findIndex((token) => token.type === 'footnote_block_open');
  if (start < 0) {
    return 0;
  }
  const end = tokens.findIndex((token, index) => index > start && token.type === 'footnote_block_close');
  const texts = new Map<number, string>();
  for (let index = start; index < end; index++) {
    if (tokens[index].type !== 'footnote_open') {
      continue;
    }
    const close = tokens.findIndex((token, at) => at > index && token.type === 'footnote_close');
    const body = tokens.slice(index + 1, close).filter((token) => token.type !== 'footnote_anchor');
    for (const token of body) {
      if (token.children) {
        token.children = token.children.filter((child) => child.type !== 'footnote_anchor');
      }
    }
    const rendered = state.md.renderer.render(body, state.md.options, state.env).trim();
    texts.set(tokens[index].meta.id, rendered.replace(/<p\b[^>]*>/g, '<span class="footnote-paragraph">').replace(/<\/p>/g, '</span>'));
    index = close;
  }
  tokens.splice(start, end - start + 1);
  const numbers = new Map<number, number>();
  for (const token of tokens) {
    if (token.type !== 'inline' || !token.children) {
      continue;
    }
    token.children = token.children.map((child) => {
      if (child.type !== 'footnote_ref') {
        return child;
      }
      const id: number = child.meta.id;
      if (!numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
        return html(state, `<span class="footnote">${texts.get(id) ?? ''}</span>`);
      }
      return html(state, `<sup class="footnote-again">${numbers.get(id)}</sup>`);
    });
  }
  return numbers.size;
}

/** alertMark matches the first line of an alert of GitHub, such as `[!NOTE]`, and gives its kind. */
const alertMark = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

/** alertTitles are the titles of the kinds of the alerts, as GitHub writes them. */
const alertTitles: Readonly<Record<string, string>> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

/**
 * placeAlerts turns each block quote whose first line is the mark of an alert of GitHub, such as `> [!NOTE]`, into the
 * element of an alert as GitHub writes it ([R-REN-014](../../docs/requirements.md#r-ren-014)):
 * `<div class="markdown-alert markdown-alert-note">` with the title `<p class="markdown-alert-title">Note</p>` and the
 * text of the quote after the mark. Another block quote stays a quotation.
 * @param state - The state of the rule.
 */
function placeAlerts(state: StateCore): void {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length; index++) {
    const open = tokens[index];
    const inline = tokens[index + 2];
    const mark = open.type === 'blockquote_open' && tokens[index + 1]?.type === 'paragraph_open' && inline?.type === 'inline' ? alertMark.exec(inline.content) : null;
    if (!mark) {
      continue;
    }
    const kind = mark[1].toLowerCase();
    const close = tokens.findIndex((token, at) => at > index && token.type === 'blockquote_close' && token.level === open.level);
    open.type = 'alert_open';
    open.tag = 'div';
    open.attrSet('class', `markdown-alert markdown-alert-${kind}`);
    tokens[close].type = 'alert_close';
    tokens[close].tag = 'div';
    // The mark is the first line of the paragraph: the text after its line break stays.
    const children = inline.children ?? [];
    const lineBreak = children.findIndex((child) => child.type === 'softbreak' || child.type === 'hardbreak');
    if (lineBreak < 0) {
      tokens.splice(index + 1, 3);
    } else {
      inline.children = children.slice(lineBreak + 1);
      inline.content = inline.content.slice(mark[0].length);
      const paragraph = tokens[index + 1];
      if (paragraph.map) {
        paragraph.map = [paragraph.map[0] + 1, paragraph.map[1]];
      }
    }
    tokens.splice(index + 1, 0, html(state, `<p class="markdown-alert-title">${alertTitles[kind]}</p>\n`, true));
  }
}

/** listingComment matches the comment of a listing of Markdown Notes, `<!-- listing: ../src/fields.ts#read-fields -->`. */
const listingComment = /^\s*<!--\s*listing:\s*(\S+)\s*-->\s*$/;

/** citeText matches the cite of the source after the link of the caption of a listing: "(fields.ts, L12-L30)". */
const citeText = /^\s*\([^()]+\)\s*$/;

/** ListingMeta is the mark of the code block of a listing for the renderer of code blocks, in the meta of its token. */
interface ListingMeta {
  paperListing?: { lineNumbers: boolean };
}

/**
 * listingCode gives the code block of a listing the class `listing`, and the numbers of its lines when the layout asks
 * for them.
 * @param html - The HTML of the code block.
 * @param lineNumbers - True for the numbers of the lines.
 */
export function listingCode(html: string, lineNumbers: boolean): string {
  const marked = html.replace(/^<pre\b([^>]*)>/, (_all, attributes: string) =>
    /\bclass="/.test(attributes) ? `<pre${attributes.replace(/\bclass="/, 'class="listing ')}>` : `<pre class="listing"${attributes}>`,
  );
  return lineNumbers ? numberLines(marked) : marked;
}

/**
 * numberLines puts the number of each line before the lines of the code of a code block, as an empty element whose
 * number the style sheet shows, so that it works with the colors of a highlighter and on a page that continues the
 * code block on the next page.
 * @param html - The HTML of the code block.
 */
export function numberLines(html: string): string {
  const open = /<code[^>]*>(?:<div[^>]*>)?/.exec(html);
  const end = html.lastIndexOf('</code>');
  if (!open || end < open.index + open[0].length) {
    return html;
  }
  const start = open.index + open[0].length;
  const lines = html.slice(start, end).split('\n');
  // The code ends with a line break, after which only the end of an element of the highlighter can stand.
  const last = lines.length > 1 && /^(?:<\/div>)?$/.test(lines[lines.length - 1]) ? lines.pop() : undefined;
  const numbered = lines.map((line, index) => `<span class="line-number" data-number="${index + 1}" aria-hidden="true"></span>${line}`);
  return `${html.slice(0, start)}${[...numbered, ...(last !== undefined ? [last] : [])].join('\n')}${html.slice(end)}`;
}

/**
 * paperRule is the rule of the renderer that runs after the rules of markdown-it and of the footnotes.
 * @param layout - The layout of the document.
 * @param found - What the rule finds, which it fills.
 */
function paperRule(layout: Layout, found: Found) {
  return (state: StateCore): void => {
    found.notes = removeNotes(state.tokens);
    found.footnotes = placeFootnotes(state);
    placeAlerts(state);
    const tokens = state.tokens;
    const terms = layout.terms;
    const ids = new Set<string>();
    const unique = (base: string): string => {
      let id = base;
      for (let count = 1; ids.has(id); count++) {
        id = `${base}-${count}`;
      }
      ids.add(id);
      return id;
    };
    const patterns = layout.unnumbered.map((pattern) => new RegExp(pattern, 'iu'));
    const headingTexts = tokens.flatMap((token, index) => (token.type === 'heading_open' ? [plainText(tokens[index + 1].children ?? [])] : []));
    const numberedByHand = headingTexts.some((text) => byHand.test(text));
    const counters = [0, 0, 0, 0, 0, 0];
    let unnumberedBelow = 0;
    let appendixPart = false;
    let appendix = -1;
    const appendixCount = (() => {
      let inPart = false;
      let count = 0;
      for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].type !== 'heading_open') {
          continue;
        }
        const level = Number(tokens[index].tag.slice(1));
        const plain = plainText(tokens[index + 1].children ?? []);
        const marker = headingMarker.exec(plain)?.[1];
        if (level === 1) {
          inPart = sectionOf(plain.replace(headingMarker, ''), level, marker, terms) === 'APX';
        } else if (level === 2 && inPart) {
          count++;
        }
      }
      return count;
    })();
    let figureCount = 0;
    let tableCount = 0;
    let listingCount = 0;
    /**
     * numberOf returns the number of a caption and the count of its kind: the number that the file gives it, else the
     * next number, with the letter of the appendix in the appendix part.
     * @param given - The number in the file, or undefined.
     * @param count - The count of the captions of the kind so far.
     */
    const numberOf = (given: string | undefined, count: number): [string, number] => {
      if (given) {
        return [given, Number(/\d+$/.exec(given)?.[0] ?? count)];
      }
      return [appendixPart && appendix >= 0 ? `${letter(appendix)}${count + 1}` : String(count + 1), count + 1];
    };
    const figureCaption = captionPattern('Figure', terms.figure);
    const tableCaption = captionPattern('Table', terms.table);
    const listingCaption = captionPattern('Listing', terms.listing);
    /** generated is the list section that the rule is in, until the next heading of its level or above. */
    let generated: GeneratedList | undefined;
    let generatedLevel = 0;
    /** inList is true between the markers of the list of the section. */
    let inList = false;
    /** listLinks are the links of the lists of the sections, which the rule checks as entries. */
    const listLinks = new Map<Token, { list: GeneratedList; line: number }>();
    /** references is the level of the heading of the reference list while the rule is in it, else 0. */
    let references = 0;
    /**
     * part is the part of the document that the rule is in, from its first heading of the level 1 on. Each part is in
     * an element `<div class="paper-part paper-front">`, `paper-body` or `paper-appendix`, so that a layout can give
     * each part its own pages.
     */
    let part: Part | undefined;
    /** links are the links to a place in the file, which can name a figure or a table. */
    const links: { open: Token; text: Token[]; line: number }[] = [];
    const output: Token[] = [];

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.type === 'inline') {
        links.push(...linksOf(token.children ?? [], token.map?.[0] ?? 0));
      }
      if (token.map && token.nesting === 1) {
        token.attrSet('data-line', String(token.map[0]));
      }
      if (token.type === 'heading_open') {
        const level = Number(token.tag.slice(1));
        if (generated && level <= generatedLevel) {
          generated = undefined;
          inList = false;
        }
        if (references && level <= references) {
          output.push(html(state, '</section>\n', true));
          references = 0;
        }
        const inline = tokens[index + 1];
        // The ID of a heading is the ID that GitHub gives it, from its text as the file writes it, so that a Markdown
        // link such as [Kapitel 2](#methoden) works on GitHub and on the pages. An anchor at the end of the heading,
        // `<a id="sec-methods"></a>`, stays as a second target.
        const children = inline.children ?? [];
        const anchor = trailingAnchor(children);
        const source = headingSource(children);
        const last = withoutTrailingSpace(anchor ? children.slice(0, anchor.start) : children).at(-1);
        let marker: string | undefined;
        if (last?.type === 'text' && headingMarker.test(last.content)) {
          marker = headingMarker.exec(last.content)?.[1];
          last.content = last.content.replace(headingMarker, '');
        }
        const text = plainText(children);
        const code = sectionOf(text, level, marker, terms);
        if (level === 1) {
          appendixPart = code === 'APX';
          const next: Part = appendixPart ? 'appendix' : (part === undefined || part === 'front') && code && frontSections.includes(code) ? 'front' : 'body';
          if (next !== part) {
            if (part) {
              output.push(html(state, '</div>\n', true));
            }
            output.push(html(state, `<div class="paper-part paper-${next}">\n`, true));
            part = next;
          }
        }
        if (unnumberedBelow && level <= unnumberedBelow) {
          unnumberedBelow = 0;
        }
        let number = '';
        const id = unique(slug(source));
        if (anchor) {
          ids.add(anchor.id);
        }
        token.attrSet('id', id);
        let section: string | undefined = code;
        if (code) {
          token.attrJoin('class', `section-${code.toLowerCase()}`);
        }
        if (appendixPart && level === 2) {
          // APA 7: the figures and tables of an appendix are numbered A1, A2, also when it is the only appendix.
          appendix++;
          figureCount = 0;
          tableCount = 0;
          listingCount = 0;
          number = appendixCount > 1 ? `${terms.appendix} ${letter(appendix)}` : terms.appendix;
          section = `APX-${letter(appendix)}`;
          token.attrJoin('class', 'appendix');
          inline.children = [html(state, `<span class="appendix-label">${escapeHtml(number)}</span> `), ...children];
        } else if (((marker || code) && !(code && part === 'body' && layout.numberedSections.includes(code))) || appendixPart || patterns.some((pattern) => pattern.test(text))) {
          unnumberedBelow = level;
          token.attrJoin('class', 'unnumbered');
        } else if (unnumberedBelow) {
          token.attrJoin('class', 'unnumbered');
        } else if (layout.numbered && !numberedByHand && level <= layout.depth) {
          counters[level - 1]++;
          counters.fill(0, level);
          number = counters.slice(0, level).join('.');
          inline.children = [html(state, `<span class="heading-number">${number}</span> `), ...children];
        } else {
          token.attrJoin('class', 'unnumbered');
        }
        if (section) {
          token.attrSet('data-section', section);
        }
        found.headings.push({ level, id, number, text, ...(section ? { section } : {}), ...(appendixPart && level === 2 ? { appendix: true } : {}), ...(part ? { part } : {}), ...(anchor ? { anchor: anchor.id } : {}), line: token.map?.[0] ?? 0 });
        output.push(token, inline, tokens[index + 2]);
        index += 2;
        if (code && (generatedLists as readonly string[]).includes(code)) {
          generated = code as GeneratedList;
          generatedLevel = level;
          output.push(html(state, `<!--paper:${code}-->\n`, true));
        } else if (code === 'BIB') {
          references = level;
          output.push(html(state, layout.references.hyphenate ? '<section class="references">\n' : '<section class="references no-hyphens">\n', true));
        }
        continue;
      }
      if (generated) {
        // The list of the file between the markers of the section gives its entries; the rest of the section does
        // not show.
        const marker = token.type === 'html_block' ? listMarker.exec(token.content) : null;
        if (marker && marker[2].toUpperCase() === generated) {
          inList = marker[1] === '';
          if (inList) {
            found.lists[generated] = [];
          }
        } else if (inList && token.type === 'inline') {
          const children = token.children ?? [];
          const open = children.findIndex((child) => child.type === 'link_open' && child.attrGet('href')?.startsWith('#'));
          if (open >= 0) {
            const close = children.findIndex((child, position) => position > open && child.type === 'link_close');
            // The page of an entry comes from target-counter(), which finds the ID only without the escapes of markdown-it.
            found.lists[generated]?.push({ href: decodedTarget(children[open].attrGet('href')?.slice(1) ?? ''), text: plainText(children.slice(open + 1, close < 0 ? undefined : close)).trim() });
            listLinks.set(children[open], { list: generated, line: token.map?.[0] ?? 0 });
          }
        }
        continue;
      }
      if (token.type === 'paragraph_open' && tokens[index + 1]?.type === 'inline') {
        const inline = tokens[index + 1];
        const anchor = trailingAnchor(inline.children ?? []);
        const kept = anchor ? (inline.children ?? []).slice(0, anchor.start) : (inline.children ?? []);
        const text = plainText(kept);
        const image = imageOf(tokens, index);
        // A figure: a paragraph "Figure 1: …" directly before an image alone in its paragraph, with the anchor of the
        // figure at the end of one of the two. The caption stands above the image, as in APA 7.
        const figure = figureCaption.exec(text);
        const next = imageOf(tokens, index + 3);
        if (figure && next && !image) {
          let number: string;
          [number, figureCount] = numberOf(figure[1], figureCount);
          const named = anchor ?? next.anchor;
          if (named) {
            ids.add(named.id);
          }
          const id = named ? named.id : unique(`figure-${number.toLowerCase()}`);
          const label = `${terms.figure} ${number}`;
          const kids = withoutTrailingSpace(kept);
          const first = kids.find((child) => child.type === 'text');
          if (first) {
            first.content = first.content.replace(figureCaption, '');
          }
          token.tag = 'figure';
          token.attrJoin('class', 'figure');
          token.attrSet('id', id);
          inline.children = [
            html(state, `<figcaption><span class="caption-label">${escapeHtml(label)}</span><span class="caption-separator">: </span><span class="caption-text">`),
            ...kids,
            html(state, '</span></figcaption>'),
          ];
          tokens[index + 2].hidden = true;
          tokens[index + 3].hidden = true;
          tokens[index + 4].children = withoutTrailingSpace(next.kept);
          tokens[index + 5].tag = 'figure';
          found.figures.push({ id, label, text: plainText(kids), line: token.map?.[0] ?? 0 });
          output.push(...tokens.slice(index, index + 6));
          index += 5;
          continue;
        }
        // An image alone in its paragraph, without a caption before it: a figure without a caption and a number.
        if (image) {
          token.tag = 'figure';
          token.attrJoin('class', 'figure');
          tokens[index + 2].tag = 'figure';
          inline.children = withoutTrailingSpace(kept);
          if (anchor) {
            ids.add(anchor.id);
            token.attrSet('id', anchor.id);
          }
        }
        // A caption of a table: "Table 1: …" directly before the table, and maybe the anchor of the table at its end.
        const table = tableCaption.exec(text);
        if (tokens[index + 3]?.type === 'table_open' && table) {
          let number: string;
          [number, tableCount] = numberOf(table[1], tableCount);
          let id: string;
          if (anchor) {
            ids.add(anchor.id);
            id = anchor.id;
          } else {
            id = unique(`table-${number.toLowerCase()}`);
          }
          const label = `${terms.table} ${number}`;
          const kids = withoutTrailingSpace(kept);
          const first = kids.find((child) => child.type === 'text');
          if (first) {
            first.content = first.content.replace(tableCaption, '');
          }
          token.attrSet('id', id);
          token.attrJoin('class', 'caption table-caption');
          inline.children = [
            html(state, `<span class="caption-label">${escapeHtml(label)}</span><span class="caption-separator">: </span><span class="caption-text">`),
            ...kids,
            html(state, '</span>'),
          ];
          found.tables.push({ id, label, text: text.replace(tableCaption, ''), line: token.map?.[0] ?? 0 });
        }
        // A caption of a listing: "Listing 1: …" directly before the comment of the source and the code block.
        const comment = tokens[index + 3]?.type === 'html_block' ? listingComment.exec(tokens[index + 3].content) : null;
        const fence = comment ? tokens[index + 4] : tokens[index + 3];
        const listing = listingCaption.exec(text);
        if (fence?.type === 'fence' && listing) {
          let number: string;
          [number, listingCount] = numberOf(listing[1], listingCount);
          let id: string;
          if (anchor) {
            ids.add(anchor.id);
            id = anchor.id;
          } else {
            id = unique(`listing-${number.toLowerCase()}`);
          }
          const label = `${terms.listing} ${number}`;
          // The caption is a link to the source, which a page cannot open: the page shows its text. The cite of the
          // source after the link, which the formatter of Markdown Notes writes, gets an element of its own.
          let kids = withoutTrailingSpace(kept);
          const link = kids.find((child) => child.type === 'link_open' && !child.attrGet('href')?.startsWith('#'));
          let cite = '';
          if (link) {
            const open = kids.indexOf(link);
            const close = kids.findIndex((child, position) => position > open && child.type === 'link_close');
            const after = close >= 0 ? plainText(kids.slice(close + 1)) : '';
            if (citeText.test(after)) {
              cite = after.trim();
              kids = kids.slice(0, close + 1);
            }
            kids = kids.filter((_child, position) => position !== open && position !== close);
          }
          const first = kids.find((child) => child.type === 'text');
          if (first) {
            first.content = first.content.replace(listingCaption, '');
          }
          token.attrSet('id', id);
          token.attrJoin('class', 'caption listing-caption');
          inline.children = [
            html(state, `<span class="caption-label">${escapeHtml(label)}</span><span class="caption-separator">: </span><span class="caption-text">`),
            ...kids,
            html(state, `</span>${cite ? `<span class="caption-source"> ${escapeHtml(cite)}</span>` : ''}`),
          ];
          fence.meta = { ...(fence.meta as object | undefined), paperListing: { lineNumbers: layout.listings.lineNumbers } } satisfies ListingMeta;
          found.listings.push({ id, label, text: plainText(kids), line: token.map?.[0] ?? 0 });
        }
      }
      output.push(token);
    }
    if (references) {
      output.push(html(state, '</section>\n', true));
    }
    if (part) {
      output.push(html(state, '</div>\n', true));
    }
    state.tokens = output;
    // A link whose text is a word and a number gets the label of its target: the label of a figure or a table
    // ("Abbildung 1"), the label of an appendix ("Anhang A"), or the word of the link and the number of a heading
    // ("Kapitel 2.1"). A heading without a number keeps the text of its links.
    const labels = new Map([...found.figures, ...found.tables, ...found.listings].map((caption) => [caption.id, caption.label]));
    const headings = new Map(found.headings.flatMap((heading) => [[heading.id, heading], ...(heading.anchor ? [[heading.anchor, heading] as const] : [])]));
    for (const link of links) {
      const target = decodedTarget(link.open.attrGet('href')?.slice(1) ?? '');
      const entry = listLinks.get(link.open);
      if (entry) {
        // An entry of a list must find its heading, figure, table or listing.
        if (!labels.has(target) && !headings.has(target) && !ids.has(target)) {
          found.problems.push({ severity: 'warning', message: `The entry #${target} of the ${entry.list} names no heading, figure, table or listing of the file.`, line: entry.line });
        }
        continue;
      }
      const heading = headings.get(target);
      const text = link.text.map((child) => child.content).join('').trim();
      const reference = link.text.length > 0 && link.text.every((child) => child.type === 'text') && referenceText.test(text);
      if (!labels.has(target) && !heading) {
        // A link of a cross reference, by its target or by its text, such as "Kapitel 2.1", must find its target.
        if ((/^(?:fig|tab|lst|sec)-/.test(target) || reference) && !ids.has(target)) {
          found.problems.push({ severity: 'warning', message: `The link #${target} names no figure, table, listing or heading of the file.`, line: link.line });
        }
        continue;
      }
      if (!reference) {
        continue;
      }
      const words = /^(\p{L}+\.?)\s/u;
      const label = labels.get(target) ?? (heading?.appendix ? heading.number : heading?.number ? `${words.exec(text)?.[1] ?? ''} ${heading.number}` : undefined);
      if (label !== undefined) {
        link.text[0].content = label;
        for (const child of link.text.slice(1)) {
          child.content = '';
        }
      }
    }
  };
}

/**
 * linksOf returns the links of inline tokens whose target is a place in the file (`#id`), with the tokens of their text.
 * @param tokens - The inline tokens.
 * @param line - The line of the tokens in the file.
 */
function linksOf(tokens: readonly Token[], line: number): { open: Token; text: Token[]; line: number }[] {
  const result: { open: Token; text: Token[]; line: number }[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'link_open' || !tokens[index].attrGet('href')?.startsWith('#')) {
      continue;
    }
    const text: Token[] = [];
    let end = index + 1;
    while (end < tokens.length && tokens[end].type !== 'link_close') {
      text.push(tokens[end]);
      end++;
    }
    result.push({ open: tokens[index], text, line });
    index = end;
  }
  return result;
}

/**
 * onlyForPapers makes the rules of a ruler work only in a rendering of a paper document.
 * @param ruler - The ruler of markdown-it.
 * @param names - The names of the rules.
 */
function onlyForPapers(ruler: { __rules__: { name: string; fn: (...args: never[]) => unknown; alt: string[] }[]; at(name: string, fn: (...args: never[]) => unknown, options?: { alt: string[] }): void }, names: readonly string[]): void {
  for (const name of names) {
    const rule = ruler.__rules__.find((candidate) => candidate.name === name);
    if (rule) {
      const fn = rule.fn as (state: { env?: { nimblescapePaper?: PaperEnv } }, ...rest: unknown[]) => unknown;
      ruler.at(name, ((state: { env?: { nimblescapePaper?: PaperEnv } }, ...rest: unknown[]) => (state.env?.nimblescapePaper ? fn(state, ...rest) : false)) as never, { alt: rule.alt });
    }
  }
}

/**
 * paperPlugin adds the rule of the renderer to a markdown-it instance, and the footnotes when it has none. Both work
 * only when the environment of a rendering has `nimblescapePaper`. The rule puts a token of the type `paperTokenType`
 * first, whose meta is that PaperEnv, so that the rendering of the tokens finds it again.
 * @param md - The markdown-it instance.
 */
export function paperPlugin(md: MarkdownIt): void {
  // Another plugin, such as the footnotes of an extension of VS Code, may have the footnotes already.
  if (!(md.block.ruler as unknown as { __rules__: { name: string }[] }).__rules__.some((rule) => rule.name === 'footnote_def')) {
    md.use(footnote);
    onlyForPapers(md.block.ruler as never, ['footnote_def']);
    onlyForPapers(md.inline.ruler as never, ['footnote_inline', 'footnote_ref']);
    onlyForPapers(md.core.ruler as never, ['footnote_tail']);
  }
  md.core.ruler.push('nimblescape_paper', (state) => {
    const paper = (state.env as { nimblescapePaper?: PaperEnv } | undefined)?.nimblescapePaper;
    if (!paper) {
      return;
    }
    paperRule(paper.layout, paper.found)(state);
    const token = new state.Token(paperTokenType, '', 0);
    token.meta = paper;
    token.hidden = true;
    state.tokens.unshift(token);
  });
  md.renderer.rules[paperTokenType] = () => '';
  // The code block of a listing gets its class, and the numbers of its lines when the layout asks for them.
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const rendered = fence ? fence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
    const listing = (tokens[index].meta as ListingMeta | null)?.paperListing;
    return listing ? listingCode(rendered, listing.lineNumbers) : rendered;
  };
}

/** listClasses are the classes of the element of each list. */
const listClasses: Record<GeneratedList, string> = { TOC: 'contents', LOF: 'list-of-figures', LOT: 'list-of-tables', LOL: 'list-of-listings' };

/**
 * listOfFile returns the HTML of the list of a special section from its entries in the file, with the elements and
 * classes of the list of the renderer: a heading gets the level of its heading, and the number of the text of an entry
 * its own element; the text of an entry of figures, tables or listings is a label and a caption, such as
 * "Figure 1: Participants".
 * @param code - The code of the list.
 * @param entries - The entries of the file.
 * @param found - What the rule found.
 */
function listOfFile(code: GeneratedList, entries: readonly Entry[], found: Found): string {
  const headings = new Map(found.headings.flatMap((heading) => [[heading.id, heading], ...(heading.anchor ? [[heading.anchor, heading] as const] : [])]));
  const items = entries.map((entry) => {
    const href = `#${escapeHtml(entry.href)}`;
    if (code === 'TOC') {
      const heading = headings.get(entry.href);
      const classes = `contents-level-${heading?.level ?? 1}${heading?.appendix ? ' appendix' : /^\d/.test(entry.text) ? '' : ' unnumbered'}${partClass(heading)}`;
      const appendix = heading?.appendix ? /^(.+?):\s+(.+)$/.exec(entry.text) : null;
      const numbered = /^(\d+(?:\.\d+)*\.?)\s+(.+)$/.exec(entry.text);
      const text = appendix
        ? `<span class="contents-text"><span class="appendix-label">${escapeHtml(appendix[1])}</span><span class="appendix-separator">: </span>${escapeHtml(appendix[2])}</span>`
        : numbered
          ? `<span class="contents-number">${escapeHtml(numbered[1])}</span><span class="contents-text">${escapeHtml(numbered[2])}</span>`
          : `<span class="contents-text">${escapeHtml(entry.text)}</span>`;
      return `<li class="${classes}"><a href="${href}">${text}</a></li>`;
    }
    const caption = /^(.+?):\s+(.+)$/.exec(entry.text);
    const text = caption
      ? `<span class="caption-label">${escapeHtml(caption[1])}</span><span class="caption-separator">: </span><span class="caption-text">${escapeHtml(caption[2])}</span>`
      : `<span class="caption-text">${escapeHtml(entry.text)}</span>`;
    return `<li><a href="${href}"><span class="caption-entry">${text}</span></a></li>`;
  });
  return `<nav class="${listClasses[code]} no-hyphens"><ol>\n${items.join('\n')}\n</ol></nav>\n`;
}

/**
 * partClass returns the class of an entry of the table of contents for the part of its heading: ` contents-front` or
 * ` contents-appendix`, so that a layout can show the page of an entry of the appendix part in its own numbers, else
 * nothing.
 * @param heading - The heading of the entry, if the document has it.
 */
const partClass = (heading: Heading | undefined): string => (heading?.part === 'front' || heading?.part === 'appendix' ? ` contents-${heading.part}` : '');

/**
 * inContents is true for a heading that the table of contents lists: each heading to the depth of the layout, but not
 * its own heading, and not the headings of the front part when the layout says `contents.front: false`.
 * @param heading - The heading.
 * @param layout - The layout of the document.
 */
export function inContents(heading: Heading, layout: Layout): boolean {
  return heading.level <= layout.contentsDepth && heading.section !== 'TOC' && (layout.contentsFront || heading.part !== 'front');
}

/**
 * list returns the HTML of the list of a special section: the table of contents, the list of figures, of tables or of
 * listings. The style sheet adds the page numbers with `target-counter`. The list is the one of the file when it has
 * one between the markers of the section; else the renderer makes it: the table of contents lists the headings of
 * `inContents`.
 * @param code - The code of the list.
 * @param found - What the rule found.
 * @param layout - The layout of the document.
 */
function list(code: GeneratedList, found: Found, layout: Layout): string {
  const entries = found.lists[code];
  if (entries) {
    return listOfFile(code, entries, found);
  }
  if (code === 'TOC') {
    const items = found.headings
      .filter((heading) => inContents(heading, layout))
      .map((heading) => {
        const classes = `contents-level-${heading.level}${heading.appendix ? ' appendix' : heading.number ? '' : ' unnumbered'}${partClass(heading)}`;
        const entry = heading.appendix
          ? `<span class="contents-text"><span class="appendix-label">${escapeHtml(heading.number)}</span><span class="appendix-separator">: </span>${escapeHtml(heading.text)}</span>`
          : (heading.number ? `<span class="contents-number">${escapeHtml(heading.number)}</span>` : '') + `<span class="contents-text">${escapeHtml(heading.text)}</span>`;
        return `<li class="${classes}"><a href="#${heading.id}">${entry}</a></li>`;
      });
    return `<nav class="contents no-hyphens"><ol>\n${items.join('\n')}\n</ol></nav>\n`;
  }
  const captions = code === 'LOF' ? found.figures : code === 'LOT' ? found.tables : found.listings;
  const items = captions.map(
    (caption) =>
      `<li><a href="#${caption.id}"><span class="caption-entry"><span class="caption-label">${escapeHtml(caption.label)}</span><span class="caption-separator">: </span>` +
      `<span class="caption-text">${escapeHtml(caption.text)}</span></span></a></li>`,
  );
  return `<nav class="${listClasses[code]} no-hyphens"><ol>\n${items.join('\n')}\n</ol></nav>\n`;
}

/**
 * finishBody returns the HTML of a rendering of a paper document with its generated lists and its soft hyphens.
 * @param html - The HTML of markdown-it.
 * @param found - What the rule found.
 * @param layout - The layout.
 * @param hyphenate - The hyphenation of a text, or undefined for no hyphens.
 */
export function finishBody(html: string, found: Found, layout: Layout, hyphenate?: (text: string) => string): string {
  const hyphenated = hyphenate ? hyphenateHtml(html, hyphenate) : html;
  return hyphenated.replace(/<!--paper:(TOC|LOF|LOT|LOL)-->\n?/g, (_all, code: GeneratedList) => list(code, found, layout));
}

/**
 * renderBody returns the HTML of the Markdown text of a document in its layout.
 * @param markdown - The Markdown text after the front matter, with an empty line for each line of the front matter.
 * @param layout - The layout of the document.
 * @param hyphenate - The hyphenation of a text, or undefined for no hyphens.
 * @param plugins - The markdown-it plugins of other extensions, which work before the rule of the renderer.
 */
export function renderBody(markdown: string, layout: Layout, hyphenate?: (text: string) => string, plugins: readonly MarkdownPlugin[] = []): Body {
  const found = emptyFound();
  let md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  for (const plugin of plugins) {
    md = plugin(md) ?? md;
  }
  paperPlugin(md);
  const env: { nimblescapePaper: PaperEnv } = { nimblescapePaper: { layout, found } };
  const html = finishBody(md.render(markdown, env), found, layout, hyphenate);
  return { html, ...found };
}
