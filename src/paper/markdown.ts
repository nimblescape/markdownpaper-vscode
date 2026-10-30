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
 *   the heading of a special section (TOC, LOF, LOT, BIB, ADT, AST, ACC, FWD, APX: by its words in the language of
 *   the layout, or by a marker such as `{BIB}`), and a heading that a pattern of the layout names get none, nor do
 *   the headings below them.
 * - An image alone in its paragraph is a figure, with its text as the caption: "Abbildung 1: …". A paragraph
 *   "Table: …" directly before a table is the caption of the table: "Tabelle 1: …". A paragraph "Listing: …" before a
 *   listing of Markdown Notes, a fenced code block with the comment of its source, is the caption of the listing:
 *   "Listing 1: …", with the file and the lines of the source after it, and the code gets the numbers of its lines
 *   when the layout asks for them ([R-REN-011](../../docs/requirements.md#r-ren-011)).
 * - The section of the table of contents (TOC), of the list of figures (LOF) or of the list of tables (LOT) gets its
 *   generated list; the reference list (BIB) gets no soft hyphens.
 * - The headings of the level 2 in the appendix part, after the heading "Anhang" or "Appendix", are the appendices
 *   A, B, … (one appendix has no letter), whose figures, tables and listings are numbered A1, A2, … as APA 7 numbers
 *   them.
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

/** wbr matches the element <wbr> that stands before a start marker. */
const wbr = /^<wbr\s*\/?>$/i;

/**
 * headingMarker matches a marker at the end of a heading: `{-}` or `{.unnumbered}` for a heading without a number, or
 * the code of a special section, for example `{BIB}`, for a heading whose words are not the words of the language.
 */
const headingMarker = new RegExp(`\\s*\\{(-|\\.unnumbered|${sectionCodes.join('|')})\\}\\s*$`);

/** generatedLists are the special sections whose list the renderer writes. */
const generatedLists = ['TOC', 'LOF', 'LOT'] as const;

type GeneratedList = (typeof generatedLists)[number];

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

/** Found is what the rule finds in the tokens, for one rendering. */
export interface Found extends Omit<Body, 'html'> {
  hyphenate?: (text: string) => string;
}

/** found returns an empty Found. */
export const emptyFound = (): Found => ({ headings: [], figures: [], tables: [], listings: [], footnotes: 0, notes: 0, problems: [] });

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
 * returns the number of the removed notes.
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
      if (child.type === 'html_inline' && noteStart.test(child.content)) {
        return false;
      }
      const next = children[index + 1];
      return !(child.type === 'html_inline' && wbr.test(child.content) && next?.type === 'html_inline' && noteStart.test(next.content));
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

/** listingComment matches the comment of a listing of Markdown Notes, `<!-- listing: ../src/fields.ts#read-fields -->`. */
const listingComment = /^\s*<!--\s*listing:\s*(\S+)\s*-->\s*$/;

/**
 * sourceOf returns the file and the lines of the source of a listing for its caption, for example "fields.ts, L12-L30",
 * from the target of the link of the caption (`../src/fields.ts#L12-L30`, one line `#L12`, the whole file without `#`),
 * or from the comment of the listing, which names a snippet and no lines.
 * @param target - The target, or undefined.
 */
function sourceOf(target: string | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  const [path, fragment = ''] = target.split('#', 2);
  let file = path.split('?')[0].split('/').filter((part) => part !== '').at(-1) ?? '';
  try {
    file = decodeURIComponent(file);
  } catch {
    // A name with a wrong escape stays as it is.
  }
  if (file === '') {
    return undefined;
  }
  const lines = /^L\d+(?:-L\d+)?$/.test(fragment) ? fragment : '';
  return lines ? `${file}, ${lines}` : file;
}

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
    /** generated is the generated list whose section the rule is in, until the next heading of its level or above. */
    let generated: GeneratedList | undefined;
    let generatedLevel = 0;
    /** references is the level of the heading of the reference list while the rule is in it, else 0. */
    let references = 0;
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
        } else if (marker || code || appendixPart || patterns.some((pattern) => pattern.test(text))) {
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
        found.headings.push({ level, id, number, text, ...(section ? { section } : {}), ...(appendixPart && level === 2 ? { appendix: true } : {}), ...(anchor ? { anchor: anchor.id } : {}), line: token.map?.[0] ?? 0 });
        output.push(token, inline, tokens[index + 2]);
        index += 2;
        if (code === 'TOC' || code === 'LOF' || code === 'LOT') {
          generated = code;
          generatedLevel = level;
          output.push(html(state, `<!--paper:${code}-->\n`, true));
        } else if (code === 'BIB') {
          references = level;
          output.push(html(state, '<section class="references no-hyphens">\n', true));
        }
        continue;
      }
      if (generated) {
        // The generated list replaces the text of its section.
        continue;
      }
      // A figure: a paragraph with only an image, whose text is the caption, and maybe the anchor of the figure.
      if (token.type === 'paragraph_open' && tokens[index + 1]?.type === 'inline') {
        const inline = tokens[index + 1];
        const anchor = trailingAnchor(inline.children ?? []);
        const kept = anchor ? (inline.children ?? []).slice(0, anchor.start) : (inline.children ?? []);
        const children = kept.filter((child) => !(child.type === 'text' && child.content.trim() === '') && child.type !== 'softbreak');
        if (children.length === 1 && children[0].type === 'image') {
          const image = children[0];
          const caption = plainText(image.children ?? []);
          token.tag = 'figure';
          token.attrJoin('class', 'figure');
          tokens[index + 2].tag = 'figure';
          inline.children = withoutTrailingSpace(kept);
          if (anchor) {
            ids.add(anchor.id);
            token.attrSet('id', anchor.id);
          }
          if (caption !== '') {
            figureCount++;
            const number = appendixPart && appendix >= 0 ? `${letter(appendix)}${figureCount}` : String(figureCount);
            const id = anchor ? anchor.id : unique(`figure-${number.toLowerCase()}`);
            const label = `${terms.figure} ${number}`;
            token.attrSet('id', id);
            const rendered = state.md.renderer.renderInline(image.children ?? [], state.md.options, state.env);
            inline.children = [
              ...inline.children,
              html(state, `<figcaption><span class="caption-label">${escapeHtml(label)}</span><span class="caption-separator">: </span><span class="caption-text">${rendered}</span></figcaption>`),
            ];
            found.figures.push({ id, label, text: caption, line: token.map?.[0] ?? 0 });
          }
        }
        // A caption of a table: "Table: …" directly before the table, and maybe the anchor of the table at its end.
        const text = plainText(kept);
        const words = [...new Set(['Table', terms.table])].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const tableCaption = new RegExp(`^(?:${words})(?:\\s+[A-Z]?\\d+)?\\s*:\\s*`, 'i');
        if (tokens[index + 3]?.type === 'table_open' && tableCaption.test(text)) {
          tableCount++;
          const number = appendixPart && appendix >= 0 ? `${letter(appendix)}${tableCount}` : String(tableCount);
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
        // A caption of a listing: "Listing: …" directly before the comment of the source and the code block.
        const listingWords = [...new Set(['Listing', terms.listing])].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const listingCaption = new RegExp(`^(?:${listingWords})(?:\\s+[A-Z]?\\d+)?\\s*:\\s*`, 'i');
        const comment = tokens[index + 3]?.type === 'html_block' ? listingComment.exec(tokens[index + 3].content) : null;
        const fence = comment ? tokens[index + 4] : tokens[index + 3];
        if (fence?.type === 'fence' && listingCaption.test(text)) {
          listingCount++;
          const number = appendixPart && appendix >= 0 ? `${letter(appendix)}${listingCount}` : String(listingCount);
          let id: string;
          if (anchor) {
            ids.add(anchor.id);
            id = anchor.id;
          } else {
            id = unique(`listing-${number.toLowerCase()}`);
          }
          const label = `${terms.listing} ${number}`;
          // The caption is a link to the source, which a page cannot open: the page shows its text, and the file and
          // the lines of the source after it.
          let kids = withoutTrailingSpace(kept);
          const link = kids.find((child) => child.type === 'link_open' && !child.attrGet('href')?.startsWith('#'));
          const source = sourceOf(link?.attrGet('href') ?? comment?.[1]);
          if (link) {
            const open = kids.indexOf(link);
            const close = kids.findIndex((child, position) => position > open && child.type === 'link_close');
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
            html(state, `</span>${layout.listings.source && source ? `<span class="caption-source"> (${escapeHtml(source)})</span>` : ''}`),
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
    state.tokens = output;
    // A link whose text is a word and a number gets the label of its target: the label of a figure or a table
    // ("Abbildung 1"), the label of an appendix ("Anhang A"), or the word of the link and the number of a heading
    // ("Kapitel 2.1"). A heading without a number keeps the text of its links.
    const labels = new Map([...found.figures, ...found.tables, ...found.listings].map((caption) => [caption.id, caption.label]));
    const headings = new Map(found.headings.flatMap((heading) => [[heading.id, heading], ...(heading.anchor ? [[heading.anchor, heading] as const] : [])]));
    for (const link of links) {
      const href = link.open.attrGet('href')?.slice(1) ?? '';
      let target = href;
      try {
        target = decodeURIComponent(href);
      } catch {
        // A link with a wrong escape keeps its text as it is.
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

/**
 * list returns the HTML of a generated list: the table of contents, the list of figures or the list of tables. The
 * style sheet adds the page numbers with `target-counter`. The table of contents lists every heading to its depth,
 * but not its own heading.
 * @param code - The code of the list.
 * @param found - What the rule found.
 * @param depth - The deepest level of heading in the table of contents.
 */
function list(code: GeneratedList, found: Found, depth: number): string {
  if (code === 'TOC') {
    const items = found.headings
      .filter((heading) => heading.level <= depth && heading.section !== 'TOC')
      .map((heading) => {
        const classes = `contents-level-${heading.level}${heading.appendix ? ' appendix' : heading.number ? '' : ' unnumbered'}`;
        const entry = heading.appendix
          ? `<span class="contents-text"><span class="appendix-label">${escapeHtml(heading.number)}</span><span class="appendix-separator">: </span>${escapeHtml(heading.text)}</span>`
          : (heading.number ? `<span class="contents-number">${escapeHtml(heading.number)}</span>` : '') + `<span class="contents-text">${escapeHtml(heading.text)}</span>`;
        return `<li class="${classes}"><a href="#${heading.id}">${entry}</a></li>`;
      });
    return `<nav class="contents no-hyphens"><ol>\n${items.join('\n')}\n</ol></nav>\n`;
  }
  const captions = code === 'LOF' ? found.figures : found.tables;
  const items = captions.map(
    (caption) =>
      `<li><a href="#${caption.id}"><span class="caption-entry"><span class="caption-label">${escapeHtml(caption.label)}</span><span class="caption-separator">: </span>` +
      `<span class="caption-text">${escapeHtml(caption.text)}</span></span></a></li>`,
  );
  return `<nav class="${code === 'LOF' ? 'list-of-figures' : 'list-of-tables'} no-hyphens"><ol>\n${items.join('\n')}\n</ol></nav>\n`;
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
  return hyphenated.replace(/<!--paper:(TOC|LOF|LOT)-->\n?/g, (_all, code: GeneratedList) => list(code, found, layout.contentsDepth));
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
