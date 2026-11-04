// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The text of the pages ([R-REN-002](../../docs/requirements.md#r-ren-002) to
 * [R-REN-006](../../docs/requirements.md#r-ren-006), [R-GEN-010](../../docs/requirements.md#r-gen-010)): the renderer
 * of `@nimblescape/markdownrender` turns the Markdown text into HTML, and the plugin of the layout of
 * `@nimblescape/markdownlayout` changes its tokens for the pages: the footnotes at the foot of the page, the addresses
 * of the links to the outside in footnotes, the numbers of the headings and of the captions, the parts of the
 * document, the special sections and their lists, the appendices, the labels of the links to figures, tables,
 * listings and headings, and the soft hyphens. The plugin `paper` of this module adds the parts of Markdown Paper
 * before the rule of the layout:
 *
 * - The notes of nimblescape Markdown Notes are not for the reader: the rule removes each footnote whose label is the
 *   label of a note (`note-` and four small letters or digits), its references, and the start markers of the notes
 *   with their `<wbr>`, as version 1 of the format of the notes defines them. It also removes the start markers of the
 *   arguments to research ([R-CITE-002](../../docs/requirements.md#r-cite-002)).
 * - The caption of a listing of Markdown Notes, "Listing 1: …" before a fenced code block with the comment of its
 *   source, loses the link to its source for VS Code and GitHub, and the cite of the source after it, such as
 *   "(fields.ts, L12-L30)", gets the element `<span class="caption-source">`, which the layout keeps after the caption.
 *   The cite gets the link when the source is a file of a public repository on GitHub; a listing of a private
 *   repository, or of the repository of the paper, keeps no link
 *   ([R-REN-011](../../docs/requirements.md#r-ren-011), [R-PDF-005](../../docs/requirements.md#r-pdf-005)).
 *
 * The rules work only in a rendering with a layout, whose environment has `nimblescapeLayout`, so the same markdown-it
 * renders a notes document without a change, also in the Markdown preview of VS Code
 * ([R-PRV-005](../../docs/requirements.md#r-prv-005)). The module uses no API of VS Code.
 */

import {
  createLayoutRenderer,
  emptyFound,
  layoutEnvKey,
  type LayoutEnv,
  layoutHtml,
  type Layout,
  type LayoutText,
  plainText,
  renderText,
  trailingAnchor,
} from '@nimblescape/markdownlayout';
import type { MarkdownRenderer, RenderPlugin } from '@nimblescape/markdownrender';
import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';

export { type Caption, decodedTarget, type Heading, inContents, type Part, referenceText } from '@nimblescape/markdownlayout';

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

/** MarkdownPlugin is a plugin of markdown-it, as `extendMarkdownIt` of an extension of VS Code gives it. */
export type MarkdownPlugin = (md: MarkdownIt) => MarkdownIt | void;

/** PaperEnv is what the plugin `paper` reads and writes in the environment of a rendering, as `nimblescapePaper`. */
export interface PaperEnv {
  /**
   * publicRepositories are the repositories of the field `repos` that are public, `owner/repository` in small
   * letters, whose listings get their link on their cite ([R-PDF-005](../../docs/requirements.md#r-pdf-005)).
   */
  publicRepositories?: readonly string[];
  /** notes is the number of the notes that the rendering removed. */
  notes?: number;
}

/** paperEnvKey is the key of the PaperEnv in the environment of a rendering. */
export const paperEnvKey = 'nimblescapePaper';

/** Body is the HTML of the text and what the layout found in it, with the number of the removed notes. */
export interface Body extends LayoutText {
  notes: number;
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
 * captionPattern returns the pattern of the start of a caption, such as "Listing 2: ", as the layout reads it.
 * @param words - The words of the caption: the English word and the word of the language.
 */
function captionPattern(...words: string[]): RegExp {
  const alternatives = [...new Set(words)].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`^(?:${alternatives})(?:\\s+([A-Z]?\\d+))?\\s*:\\s*`, 'i');
}

/** listingComment matches the comment of a listing of Markdown Notes, `<!-- listing: ../src/fields.ts#read-fields -->`. */
const listingComment = /^\s*<!--\s*listing:\s*(\S+)\s*-->\s*$/;

/** citeText matches the cite of the source after the link of the caption of a listing: "(fields.ts, L12-L30)". */
const citeText = /^\s*\([^()]+\)\s*$/;

/** githubFile matches the address of a file on GitHub and gives its repository, `owner/repository`. */
const githubFile = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\//i;

/**
 * placeListingLinks takes the link off the caption of each listing, the link to its source for VS Code and GitHub,
 * and gives the cite of the source after the caption an element `<span class="caption-source">`. The cite gets the
 * link when the source is a file of a public repository on GitHub.
 * @param state - The state of the rule.
 * @param listingCaption - The pattern of the start of a caption of a listing.
 * @param publicRepositories - The public repositories, `owner/repository` in small letters.
 */
function placeListingLinks(state: StateCore, listingCaption: RegExp, publicRepositories: readonly string[]): void {
  const tokens = state.tokens;
  for (let index = 0; index + 3 < tokens.length; index++) {
    if (tokens[index].type !== 'paragraph_open' || tokens[index + 1].type !== 'inline') {
      continue;
    }
    const comment = tokens[index + 3].type === 'html_block' && listingComment.test(tokens[index + 3].content);
    const all = tokens[index + 1].children ?? [];
    const anchor = trailingAnchor(all);
    const kept = anchor ? all.slice(0, anchor.start) : all;
    if ((comment ? tokens[index + 4] : tokens[index + 3])?.type !== 'fence' || !listingCaption.test(plainText(kept))) {
      continue;
    }
    const open = kept.findIndex((child) => child.type === 'link_open' && !child.attrGet('href')?.startsWith('#'));
    const close = kept.findIndex((child, position) => open >= 0 && position > open && child.type === 'link_close');
    if (close < 0) {
      continue;
    }
    const href = kept[open].attrGet('href') ?? '';
    const after = plainText(kept.slice(close + 1));
    let cite = kept.slice(close + 1);
    if (citeText.test(after)) {
      const text = new state.Token('text', '', 0);
      text.content = after.trim();
      const repository = githubFile.exec(href)?.[1].toLowerCase();
      if (repository && publicRepositories.includes(repository)) {
        const linkOpen = new state.Token('link_open', 'a', 1);
        linkOpen.attrSet('href', href);
        cite = [linkOpen, text, new state.Token('link_close', 'a', -1)];
      } else {
        cite = [text];
      }
      cite = [layoutHtml(state, '<span class="caption-source"> '), ...cite, layoutHtml(state, '</span>')];
    }
    tokens[index + 1].children = [...kept.slice(0, open), ...kept.slice(open + 1, close), ...cite, ...(anchor ? all.slice(anchor.start) : [])];
  }
}

/**
 * extendMarkdownIt adds the rule of the paper to a markdown-it, before the rule of the layout.
 * @param md - The markdown-it.
 */
function extendMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.push('nimblescape_paper', (state) => {
    const env = state.env as Record<string, unknown> | undefined;
    const layout = env?.[layoutEnvKey] as LayoutEnv | undefined;
    if (!layout) {
      return;
    }
    const paper = (env?.[paperEnvKey] ?? {}) as PaperEnv;
    paper.notes = removeNotes(state.tokens);
    placeListingLinks(state, captionPattern('Listing', layout.layout.terms.listing), paper.publicRepositories ?? []);
    if (env) {
      env[paperEnvKey] = paper;
    }
  });
}

/** paperTextPlugin is the plugin `paper` of the renderer: the removal of the notes and the cites of the listings. */
export const paperTextPlugin: RenderPlugin = { name: 'paper', apiVersion: 1, extendMarkdownIt };

/**
 * pluginOf returns a markdown-it plugin of an extension of VS Code as a plugin of the renderer.
 * @param plugin - The markdown-it plugin.
 * @param index - The place of the plugin, for its name.
 */
const pluginOf = (plugin: MarkdownPlugin, index: number): RenderPlugin => ({ name: `extension-${index + 1}`, apiVersion: 1, extendMarkdownIt: (md) => void plugin(md) });

/**
 * paperRenderer returns the renderer of the text of the pages: the markdown-it plugins of other extensions first, then
 * the plugin `paper`, then the plugin of the layout. The raw HTML of the file shows as the file writes it, because the
 * policy of the page lets only the scripts of the page run
 * ([R-REN-001](../../docs/requirements.md#r-ren-001)).
 * @param plugins - The markdown-it plugins of other extensions ([R-REN-010](../../docs/requirements.md#r-ren-010)).
 */
export function paperRenderer(plugins: readonly MarkdownPlugin[] = []): MarkdownRenderer {
  return createLayoutRenderer({ plugins: [...plugins.map(pluginOf), paperTextPlugin], rawHtml: 'trusted' });
}

/** defaultRenderer is the renderer without the plugins of other extensions, made once. */
let defaultRenderer: MarkdownRenderer | undefined;

/**
 * renderBody returns the HTML of the Markdown text of a document in its layout.
 * @param markdown - The Markdown text, with its front matter or with an empty line for each line of the front matter.
 * @param layout - The layout of the document.
 * @param hyphenate - The hyphenation of a text, or undefined for no hyphens.
 * @param plugins - The markdown-it plugins of other extensions, which work before the rule of the layout.
 * @param pluginEnv - The values that these plugins find in the environment of markdown-it, as in the Markdown preview of
 *   VS Code, for example `currentDocument`, by which nimblescape PlantUML finds its settings and included files.
 * @param publicRepositories - The public repositories of the field `repos`, `owner/repository` in small letters.
 */
export function renderBody(
  markdown: string,
  layout: Layout,
  hyphenate?: (text: string) => string,
  plugins: readonly MarkdownPlugin[] = [],
  pluginEnv: Readonly<Record<string, unknown>> = {},
  publicRepositories: readonly string[] = [],
): Body {
  const renderer = plugins.length > 0 ? paperRenderer(plugins) : (defaultRenderer ??= paperRenderer());
  const paper: PaperEnv = { publicRepositories };
  const text = renderText(renderer, markdown, layout, hyphenate, { ...pluginEnv, [paperEnvKey]: paper });
  return { ...text, notes: paper.notes ?? 0 };
}

export { emptyFound };
