// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The plugin of the paper for the editor of rendered Markdown of nimblescape Markdown, for example in the editor of a
 * whole file of nimblescape Markdown Notes ([R-EDIT-001](../../docs/requirements.md#r-edit-001)). It shows a paper
 * without the markup that the format step needs:
 *
 * - The database of the sources, the comment `<!-- nimblescape-sources … -->` at the end of the file, and the markers of
 *   the lists of the special sections, for example `<!-- toc -->` and `<!-- /toc -->`, are hidden blocks that keep their
 *   text byte for byte. The anchor at the start of an entry of the reference list, `<a id="hong2024"></a>`, and the start
 *   marker of an argument to research, `<wbr><!--[research-->`, are hidden nodes in the line.
 * - The parts that the format step writes are read-only
 *   ([the generated parts](https://github.com/nimblescape/markdown/blob/main/docs/editor.md#r-edit-011)): the text of a
 *   citation, a link to a source of the database, which Ctrl+click (Cmd+click on macOS) follows to the entry of the
 *   source; each entry of the reference list; each list between the markers of a special section, whose links
 *   Ctrl+click follows to their headings and captions; and the text of each link to a heading that the format step
 *   writes, a word and the number or the label of the heading, such as `[Anhang B](#daten)`. The user changes them
 *   through what they come from, and the format step writes them again when the file is saved.
 * - Backspace and Delete jump over the hidden anchors and markers in the line. A database of the sources that an edit of
 *   the user deleted goes back to the end of the document. Changes from outside, Undo and Redo pass.
 *
 * - *(proposal)* With its part on the platform, for example in the extension of VS Code (src/editorParts.ts), the plugin
 *   gives the form of the front matter the JSON schema of the layout of the paper, and shows `layout` and `repos`
 *   read-only: Ctrl+click on a reference opens its clone. `/cite` in the slash commands and in the insert menu, and
 *   "Cite" in the format bar, insert the citation of the source that the user chooses on the platform. "Research" in the
 *   format bar and `/research` typed on the selected argument mark it for an AI agent, as `/research` does in the text
 *   editor.
 *
 * In the renderer, for example in the pages, the anchors stay, so that the citations go to their entries, and the other
 * markup has no output. The bundle of the plugins (src/editor/editorPlugins.ts) uses the modules of the page of the
 * editor; this module uses no API of VS Code, so that the editor on a web page can use it too.
 */

import { Extension, Node, type Editor } from '@tiptap/core';
import { isHistoryTransaction } from '@tiptap/pm/history';
import type { Mark, Node as PmNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type MarkdownIt from 'markdown-it';
import type { StateCore, Token } from 'markdown-it';
import {
  type FormatButton,
  type FrontMatterInput,
  type GeneratedPart,
  type MarkdownPlugin,
  type MenuItem,
  outsideChange,
  type PluginChannel,
  type PluginEditor,
  type PluginHost,
  slashSelection,
} from '@nimblescape/markdowneditor';
import type { JsonSchema } from '@nimblescape/markdowntext';
import { editorPluginName, extensionMessage, type ListCode, type PageMessage } from '../paper/editorMessages';
import { headingLinkText, headingSlug, idPattern, listCodes, researchEdit, researchMark, researchText, sourcesName } from '../paper/marks';

/** pluginName is the name of the plugin. */
export const pluginName = editorPluginName;

/** The types of the tokens of the plugin. */
export const tokenTypes = { anchor: 'paper_anchor', research: 'paper_research', sources: 'paper_sources', list: 'paper_list' } as const;

/** The names of the nodes of the plugin. */
export const nodeNames = { anchor: 'paperAnchor', research: 'researchMarker', sources: 'sourcesComment', list: 'listMarker' } as const;

/** paperWrite is the meta of a transaction in which the plugin keeps its markup itself, which its guard lets pass. */
export const paperWrite = 'nimblescapePaperWrite';

/** anchorOpen matches the start tag of the anchor of an entry of the reference list, with the identifier of its source. */
const anchorOpen = /^<a id="([^"]+)">$/;

/** itemAnchor matches the name of an anchor of a figure, a table, a listing or a section, which Notes keeps. */
const itemAnchor = /^(?:fig|tab|lst|sec)-/;

/** sourcesStart matches the first line of the comment of the database. */
const sourcesStart = new RegExp(String.raw`^<!--\s*${sourcesName}\s*$`);

/** listMarker matches a marker of a list of a special section, with `/` for the end marker and the name of the list. */
const listMarker = new RegExp(String.raw`^\s*<!--\s*(/?)(${Object.values(listCodes).join('|')})\s*-->\s*$`, 'i');

/** isHtml returns true for a token of inline HTML with a text. */
const isHtml = (token: Token | undefined, text: string): boolean => token?.type === 'html_inline' && token.content === text;

/**
 * newToken returns a token of the line of a type of the plugin.
 * @param state - The state of the core rule.
 * @param type - The type.
 * @param content - The text of the markup, as the file has it.
 * @param meta - The meta of the token.
 */
function newToken(state: StateCore, type: string, content: string, meta: Record<string, string> = {}): Token {
  const token = new state.Token(type, '', 0);
  token.content = content;
  token.meta = meta;
  return token;
}

/**
 * mergeInline makes one token of the anchor of an entry at the start of a paragraph, `<a id="…">` and `</a>`, and of
 * each start marker of an argument to research with the `<wbr>` before it, among the tokens of a line.
 * @param state - The state of the core rule.
 * @param children - The tokens of the line.
 * @param paragraph - true for the line of a paragraph.
 */
function mergeInline(state: StateCore, children: readonly Token[], paragraph: boolean): Token[] {
  const merged: Token[] = [];
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child.type !== 'html_inline') {
      merged.push(child);
      continue;
    }
    const anchor = index === 0 && paragraph ? anchorOpen.exec(child.content) : null;
    if (anchor && idPattern.test(anchor[1]) && !itemAnchor.test(anchor[1]) && isHtml(children[1], '</a>')) {
      merged.push(newToken(state, tokenTypes.anchor, child.content + children[1].content, { id: anchor[1] }));
      index++;
      continue;
    }
    const wbr = child.content === '<wbr>' && isHtml(children[index + 1], researchMark) ? 1 : 0;
    if (isHtml(children[index + wbr], researchMark)) {
      merged.push(newToken(state, tokenTypes.research, (wbr ? child.content : '') + researchMark));
      index += wbr;
      continue;
    }
    merged.push(child);
  }
  return merged;
}

/**
 * blockToken returns the token of the plugin for a block of HTML: the database of the sources, or a marker of a list of
 * a special section; undefined for another block.
 * @param state - The state of the core rule.
 * @param token - The block of HTML.
 */
function blockToken(state: StateCore, token: Token): Token | undefined {
  if (token.type !== 'html_block' || !token.map) {
    return undefined;
  }
  const content = token.content.replace(/\n$/, '');
  const lines = content.split('\n');
  const marker = lines.length === 1 ? listMarker.exec(content) : null;
  const sources = sourcesStart.test(lines[0].trimEnd()) && lines.length > 1 && lines[lines.length - 1].trim() === '-->';
  if (!marker && !sources) {
    return undefined;
  }
  const block = new state.Token(marker ? tokenTypes.list : tokenTypes.sources, '', 0);
  block.block = true;
  block.level = token.level;
  block.map = token.map;
  block.content = content;
  block.meta = marker ? { code: marker[2].toLowerCase(), edge: marker[1] ? 'close' : 'open' } : {};
  return block;
}

/**
 * paperRule is the core rule that makes the tokens of the plugin. It runs after the inline rules.
 * @param state - The state of the core rule.
 */
function paperRule(state: StateCore): void {
  state.tokens.forEach((token, index) => {
    if (token.type === 'inline' && token.children && token.content.includes('<')) {
      token.children = mergeInline(state, token.children, state.tokens[index - 1]?.type === 'paragraph_open');
    }
  });
  state.tokens = state.tokens.map((token) => blockToken(state, token) ?? token);
}

/**
 * extendMarkdownIt adds the rule of the plugin to the markdown-it of the editor and of the renderer. In the output of
 * the renderer, the anchors of the entries stay as the file has them, and the other markup has none.
 * @param md - The markdown-it.
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  md.core.ruler.after('inline', 'nimblescape_paper', paperRule);
  // The text of an anchor matches anchorOpen and `</a>`, with the identifier of a source, so it holds no other HTML.
  md.renderer.rules[tokenTypes.anchor] = (tokens, index) => tokens[index].content;
  md.renderer.rules[tokenTypes.research] = () => '';
  md.renderer.rules[tokenTypes.sources] = () => '';
  md.renderer.rules[tokenTypes.list] = () => '';
  return md;
}

/** PaperAnchor is the anchor at the start of an entry of the reference list: hidden, with its text. */
const PaperAnchor = Node.create({
  name: nodeNames.anchor,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({ id: { default: '', rendered: false }, text: { default: '', rendered: false } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ['span', { class: 'nsmd-paper-anchor', 'data-source': node.attrs.id as string }],
  renderText: () => '',
});

/** ResearchMarker is the start marker of an argument to research in the line: hidden, with its text. */
const ResearchMarker = Node.create({
  name: nodeNames.research,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({ text: { default: '', rendered: false } }),
  parseHTML: () => [],
  renderHTML: () => ['span', { class: 'nsmd-paper-research' }],
  renderText: () => '',
});

/** SourcesComment is the database of the sources: a hidden block with its lines. */
const SourcesComment = Node.create({
  name: nodeNames.sources,
  group: 'block',
  atom: true,
  selectable: false,
  addAttributes: () => ({ text: { default: '', rendered: false } }),
  parseHTML: () => [],
  renderHTML: () => ['div', { class: 'nsmd-paper-sources' }],
  renderText: () => '',
});

/** ListMarker is the start marker or the end marker of a list of a special section: a hidden block with its line. */
const ListMarker = Node.create({
  name: nodeNames.list,
  group: 'block',
  atom: true,
  selectable: false,
  addAttributes: () => ({ code: { default: '', rendered: false }, edge: { default: 'open', rendered: false }, text: { default: '', rendered: false } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ['div', { class: 'nsmd-paper-list-marker', 'data-list': node.attrs.code as string, 'data-edge': node.attrs.edge as string }],
  renderText: () => '',
});

/**
 * sourceIds returns the identifiers of the sources of the database: each line between its first and its last line that
 * is a JSON object with an identifier, as the format step reads the database.
 * @param text - The text of the comment of the database.
 */
export function sourceIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const line of text.split('\n').slice(1, -1)) {
    try {
      const value: unknown = JSON.parse(line);
      const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : undefined;
      if (typeof id === 'string' && idPattern.test(id)) {
        ids.add(id);
      }
    } catch {
      // A line that is no JSON names no source; the checks of the paper report it.
    }
  }
  return ids;
}

/** List is a list of a special section between its markers, with its range. */
interface List {
  readonly from: number;
  readonly to: number;
}

/** Analysis is what the plugin finds in a document: its generated parts, the lists and the targets of their links. */
interface Analysis {
  readonly parts: GeneratedPart[];
  readonly lists: List[];
  /** targets are the positions of the textblocks of the targets of links, by the name of the place: entries, headings and anchors. */
  readonly targets: Map<string, number>;
  /** sources is the database of the sources with its position, or undefined. */
  readonly sources: { readonly pos: number; readonly node: PmNode } | undefined;
}

/** analyses holds the analysis of each document. */
const analyses = new WeakMap<PmNode, Analysis>();

/** editors are the Tiptap editors of the plugin, for the links that go to their targets. */
const editors = new Set<Editor>();

/**
 * reveal puts the cursor at a textblock of a document in the editor that shows the document, and scrolls to it.
 * @param doc - The document.
 * @param pos - The position of the textblock.
 */
function reveal(doc: PmNode, pos: number): void {
  for (const editor of editors) {
    const { state, view } = editor;
    if (state.doc === doc) {
      const selection = TextSelection.near(state.doc.resolve(Math.min(pos + 1, state.doc.content.size)));
      view.dispatch(state.tr.setSelection(selection).scrollIntoView());
      view.focus();
      return;
    }
  }
}

/**
 * linkTarget returns the name of the place of a link mark to a place of the document, `#…`, decoded, or undefined.
 * @param mark - The mark.
 */
function linkTarget(mark: Mark): string | undefined {
  const href = mark.type.name === 'link' ? (mark.attrs.href as string | null) : null;
  if (!href?.startsWith('#') || href.length < 2) {
    return undefined;
  }
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

/**
 * linksOf returns the ranges of the texts of the links of a textblock to a place of the document, with the name of the
 * place.
 * @param block - The textblock.
 * @param pos - The position of the textblock.
 */
function linksOf(block: PmNode, pos: number): { from: number; to: number; id: string }[] {
  const citations: { from: number; to: number; id: string }[] = [];
  let open: { from: number; to: number; id: string; mark: Mark } | undefined;
  block.forEach((child, offset) => {
    const from = pos + 1 + offset;
    const mark = child.isText ? child.marks.find((each) => linkTarget(each) !== undefined) : undefined;
    if (open && mark?.eq(open.mark) && open.to === from) {
      open.to = from + child.nodeSize;
      return;
    }
    if (open) {
      citations.push({ from: open.from, to: open.to, id: open.id });
      open = undefined;
    }
    const id = mark ? linkTarget(mark) : undefined;
    if (mark && id !== undefined) {
      open = { from, to: from + child.nodeSize, id, mark };
    }
  });
  if (open) {
    citations.push({ from: open.from, to: open.to, id: open.id });
  }
  return citations;
}

/**
 * analysisOf returns what the plugin finds in a document: the database of the sources, the entries of the reference
 * list, the citations, the lists of the special sections and the targets of their links.
 * @param doc - The document.
 */
export function analysisOf(doc: PmNode): Analysis {
  const known = analyses.get(doc);
  if (known) {
    return known;
  }
  let sources: Analysis['sources'];
  doc.forEach((node, pos) => {
    if (!sources && node.type.name === nodeNames.sources) {
      sources = { pos, node };
    }
  });
  const ids = sources ? sourceIds(sources.node.attrs.text as string) : new Set<string>();
  const parts: GeneratedPart[] = [];
  const lists: List[] = [];
  const targets = new Map<string, number>();
  const headingIds = new Map<string, number>();
  /** headings are the IDs of the headings and the anchors in them, the targets of the links that the format step writes. */
  const headings = new Set<string>();
  const links: { from: number; to: number; id: string }[] = [];
  const opens = new Map<string, number>();
  doc.descendants((node, pos, parent) => {
    if (node.type.name === nodeNames.list) {
      const code = node.attrs.code as string;
      if (node.attrs.edge === 'open') {
        opens.set(code, pos);
      } else if (opens.has(code) && parent === doc.resolve(opens.get(code)!).parent) {
        lists.push({ from: opens.get(code)!, to: pos + node.nodeSize });
        opens.delete(code);
      }
      return false;
    }
    if (!node.isTextblock) {
      return true;
    }
    const heading = node.type.name === 'heading';
    if (heading) {
      const slug = headingSlug(node.textContent);
      const count = headingIds.get(slug) ?? 0;
      headingIds.set(slug, count + 1);
      const id = count === 0 ? slug : `${slug}-${count}`;
      headings.add(id);
      if (!targets.has(id)) {
        targets.set(id, pos);
      }
    }
    node.forEach((child) => {
      // The anchors of the figures, the tables, the listings and the sections of Notes, and the anchors of the entries.
      const name = child.type.name === 'figureAnchor' ? (child.attrs.name as string) : undefined;
      if (name) {
        targets.set(name, pos);
        if (heading) {
          headings.add(name);
        }
      }
    });
    const first = node.firstChild;
    const entry = node.type.name === 'paragraph' && first?.type.name === nodeNames.anchor ? (first.attrs.id as string) : undefined;
    if (entry !== undefined) {
      targets.set(entry, pos);
      if (ids.has(entry)) {
        parts.push({ from: pos, to: pos + node.nodeSize });
        return false;
      }
    }
    links.push(...linksOf(node, pos));
    return false;
  });
  for (const list of lists) {
    parts.push({ from: list.from, to: list.to });
  }
  const inPart = (pos: number) => parts.some((part) => part.from <= pos && pos < part.to);
  for (const link of links) {
    if (inPart(link.from)) {
      continue;
    }
    if (ids.has(link.id)) {
      // A citation.
      parts.push({ from: link.from, to: link.to, open: () => (targets.has(link.id) ? reveal(doc, targets.get(link.id)!) : undefined) });
    } else if (headings.has(link.id) && headingLinkText.test(doc.textBetween(link.from, link.to).trim())) {
      // A link to a heading whose number or label the format step writes (R-REN-009).
      parts.push({ from: link.from, to: link.to });
    }
  }
  const analysis: Analysis = { parts: parts.sort((a, b) => a.from - b.from), lists, targets, sources };
  analyses.set(doc, analysis);
  return analysis;
}

/**
 * isUserEdit returns true for a transaction of the user that changes the document: no change from outside, no Undo or
 * Redo, and no write of this plugin.
 * @param tr - The transaction.
 */
const isUserEdit = (tr: Transaction): boolean => tr.docChanged && tr.getMeta(outsideChange) !== true && !isHistoryTransaction(tr) && tr.getMeta(paperWrite) !== true;

/**
 * guardedEdit returns the transaction that puts the database of the sources back at the end of the document after an
 * edit of the user that deleted it, or null when it stays.
 * @param transactions - The transactions of the edit.
 * @param before - The state before them.
 * @param after - The state after them.
 */
export function guardedEdit(transactions: readonly Transaction[], before: EditorState, after: EditorState): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged) || !transactions.every((tr) => !tr.docChanged || isUserEdit(tr))) {
    return null;
  }
  const lost = analysisOf(before.doc).sources;
  if (!lost || analysisOf(after.doc).sources) {
    return null;
  }
  const tr = after.tr.insert(after.doc.content.size, lost.node.type.create(lost.node.attrs));
  return tr.setMeta(paperWrite, true);
}

/** isHidden returns true for a hidden node in the line: the anchor of an entry or a marker of an argument to research. */
const isHidden = (node: PmNode | null | undefined): boolean => node?.type.name === nodeNames.anchor || node?.type.name === nodeNames.research;

/**
 * jumpOverMarkup returns the command that moves the cursor over the hidden nodes next to it, before Backspace
 * (backward) or Delete (forward) deletes a character, so that the key deletes the character beyond them. At the edge of
 * a generated part, the cursor stays, so that the key deletes the whole part. The command moves the cursor and leaves
 * the key to the next command.
 * @param direction - -1 for Backspace, 1 for Delete.
 */
function jumpOverMarkup(direction: -1 | 1) {
  return ({ editor }: { editor: Editor }): boolean => {
    const { state, view } = editor;
    const { empty, from } = state.selection;
    const next = (pos: number) => (direction < 0 ? state.doc.resolve(pos).nodeBefore : state.doc.resolve(pos).nodeAfter);
    const parts = analysisOf(state.doc).parts;
    const atPart = (pos: number) => parts.some((part) => (direction < 0 ? part.to === pos : part.from === pos));
    if (!empty || !isHidden(next(from)) || atPart(from)) {
      return false;
    }
    let at = from;
    while (isHidden(next(at)) && !atPart(at)) {
      at += direction;
    }
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)));
    return false;
  };
}

/**
 * followListLink follows the link at a position of a list of a special section to its heading or its caption on
 * Ctrl+click (Cmd+click on macOS).
 * @param view - The view.
 * @param pos - The position of the click.
 * @param event - The event of the click.
 * @returns true when the click went to a target.
 */
function followListLink(view: EditorView, pos: number, event: MouseEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) {
    return false;
  }
  const { doc } = view.state;
  const analysis = analysisOf(doc);
  if (!analysis.lists.some((list) => list.from <= pos && pos <= list.to)) {
    return false;
  }
  const $pos = doc.resolve(pos);
  const marks = [...($pos.nodeAfter?.marks ?? []), ...($pos.nodeBefore?.marks ?? [])];
  const name = marks.map(linkTarget).find((target) => target !== undefined);
  const target = name === undefined ? undefined : analysis.targets.get(name);
  if (target === undefined) {
    return false;
  }
  reveal(doc, target);
  return true;
}

/** guardKey is the key of the plugin of the guard. */
const guardKey = new PluginKey('nimblescapePaperGuard');

/** Guard keeps the markup of the plugin while the user edits, and follows the links of the lists (see the module). */
const Guard = Extension.create({
  name: 'paperGuard',
  priority: 1000,
  addKeyboardShortcuts: () => ({
    Backspace: (props) => jumpOverMarkup(-1)(props),
    Delete: (props) => jumpOverMarkup(1)(props),
  }),
  addProseMirrorPlugins: () => [
    new Plugin({
      key: guardKey,
      appendTransaction: (transactions, before, after) => guardedEdit(transactions, before, after),
      props: { handleClick: (view, pos, event) => followListLink(view, pos, event) },
    }),
  ],
});

/**
 * styles are the styles of the plugin: the database of the sources and the markers of the lists are hidden, and a
 * reference of the front matter with a clone is a link.
 */
export const styles = [
  '.nsmd-paper-sources, .nsmd-paper-list-marker { display: none; }',
  '.nsmd-paper-reference { display: inline-block; padding-top: 4px; overflow-wrap: anywhere; }',
  '.nsmd-paper-reference-link { color: var(--nsmd-link); text-decoration: underline; cursor: pointer; }',
  '.nsmd-paper-repos { display: grid; gap: 2px; }',
].join('\n');

/** Page is the state of the plugin in one editor: the channel to its part on the platform, the schema and the requests. */
interface Page {
  readonly editor: PluginEditor;
  readonly channel: PluginChannel | undefined;
  /** schema is the JSON schema of the front matter that the platform sent, or undefined. */
  schema: JsonSchema | undefined;
  /** requests counts the requests of citations and of lists; the platform answers each one with its number. */
  requests: number;
  /** lists holds the text of the file that each open request of a list sent, by its number. */
  readonly lists: Map<number, string>;
}

/** pages are the states of the plugin, by the Tiptap editor. */
const pages = new WeakMap<Editor, Page>();

/**
 * isPaper returns true for the document of a paper: a front matter of YAML with the field `layout`.
 * @param doc - The document.
 */
export function isPaper(doc: PmNode): boolean {
  const first = doc.firstChild;
  return first?.type.name === 'frontMatter' && first.attrs.format === 'yaml' && /^layout[ \t]*:/m.test(first.attrs.text as string);
}

/**
 * researchPlaces returns the positions of the start marker and of `(RESEARCH)` for the selected argument of an editor,
 * as `/research` puts them in the text editor (src/paper/marks.ts), or undefined when the selection is no argument.
 * @param state - The state of the editor.
 * @param range - The selected text, by default the selection of the state; while the list of the slash commands is open
 *   after a slash typed on selected text, the text before the slash.
 */
export function researchPlaces(state: EditorState, range: { from: number; to: number } = state.selection): { start: number; end: number } | undefined {
  const { from, to } = range;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if (from === to || !$from.sameParent($to) || !$from.parent.inlineContent) {
    return undefined;
  }
  // Each inline node that is no text is one character, so that the places in the text are the positions; a marker of
  // an argument to research is its mark, which the selection must not hold.
  const selected = state.doc.textBetween(from, to, '\n', (node) => (node.type.name === nodeNames.research ? researchMark : '\ufffc'));
  const edit = researchEdit(selected);
  return typeof edit === 'string' ? undefined : { start: from + edit.start, end: from + edit.end };
}

/**
 * markResearch marks the selected argument of an editor for an AI agent: the hidden start marker before it, and
 * `(RESEARCH)` at its end, before a punctuation mark at its end.
 * @param tiptap - The Tiptap editor.
 * @returns Whether the argument got its marks.
 */
export function markResearch(tiptap: Editor): boolean {
  const { state, view } = tiptap;
  const places = tiptap.isEditable && isPaper(state.doc) ? researchPlaces(state) : undefined;
  const marker = state.schema.nodes[nodeNames.research];
  if (!places || !marker) {
    return false;
  }
  const tr = state.tr.insertText(` ${researchText}`, places.end).insert(places.start, marker.create({ text: `<wbr>${researchMark}` }));
  const after = tr.mapping.map(places.end);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after)).scrollIntoView());
  view.focus();
  return true;
}

/**
 * insertCitation inserts a citation at the end of the selection of an editor: `([Hong et al., 2024](#hong2024))`, with a
 * space before it after a word, as `/cite` does in the text editor.
 * @param tiptap - The Tiptap editor.
 * @param id - The identifier of the source.
 * @param text - The text of the citation.
 * @returns Whether the citation was inserted.
 */
export function insertCitation(tiptap: Editor, id: string, text: string): boolean {
  const { state, view } = tiptap;
  const link = state.schema.marks.link;
  const { to, $to } = state.selection;
  if (!link || !tiptap.isEditable || !$to.parent.inlineContent || !idPattern.test(id) || text === '') {
    return false;
  }
  const before = $to.parentOffset > 0 ? state.doc.textBetween(to - 1, to, '', '\ufffc') : '';
  const citation = [state.schema.text(`${/^[^\s([]$/.test(before) ? ' ' : ''}(`), state.schema.text(text, [link.create({ href: `#${id}` })]), state.schema.text(')')];
  const tr = state.tr.insert(to, citation);
  const size = citation.reduce((sum, node) => sum + node.nodeSize, 0);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, to + size)).scrollIntoView());
  view.focus();
  return true;
}

/**
 * askCitation asks the platform for a citation, which the user chooses there; the answer inserts it.
 * @param tiptap - The Tiptap editor.
 */
function askCitation(tiptap: Editor): void {
  const page = pages.get(tiptap);
  if (page?.channel) {
    page.requests++;
    page.channel.post({ type: 'cite', request: page.requests } satisfies PageMessage);
  }
}

/**
 * askList asks the platform for the change of the text of the file that inserts the list of a special section at the
 * cursor, for `/toc`, `/lof`, `/lot` and `/lol`: the heading in the language of the layout and the list, which only the
 * platform knows.
 * @param tiptap - The Tiptap editor.
 * @param code - The code of the section.
 */
function askList(tiptap: Editor, code: ListCode): void {
  const page = pages.get(tiptap);
  if (page?.channel) {
    const request = ++page.requests;
    const text = page.editor.getMarkdown();
    page.lists.set(request, text);
    page.channel.post({ type: 'list', request, code, text, at: page.editor.textOffset(tiptap.state.selection.head) } satisfies PageMessage);
  }
}

/**
 * takeList makes the change that the platform sent for a request of a list as a change of the user, when the text of the
 * file is still the text that the request sent, and puts the cursor at the end of the heading of the section.
 * @param page - The state of the plugin.
 * @param request - The number of the request.
 * @param change - The change, or undefined when the platform has none, for example for a paper with the section.
 * @returns Whether the editor made the change.
 */
function takeList(page: Page, request: number, change: { from: number; to: number; text: string; heading: { from: number; to: number } } | undefined): boolean {
  const sent = page.lists.get(request);
  page.lists.delete(request);
  const { editor } = page;
  if (!change || sent === undefined || editor.tiptap.isDestroyed || editor.getMarkdown() !== sent || !editor.changeText([{ from: change.from, to: change.to, insert: change.text }])) {
    return false;
  }
  editor.selectText(change.from + change.heading.to);
  return true;
}

/** canCite returns true when an editor shows a paper and its platform lets the user choose a source. */
const canCite = (tiptap: Editor): boolean => pages.get(tiptap)?.channel !== undefined && tiptap.isEditable && isPaper(tiptap.state.doc);

/** listItems are the lists of the special sections in the insert menu and the slash commands: the code, the label and the words to find it. */
const listItems: readonly (readonly [ListCode, string, string[]])[] = [
  ['TOC', 'Table of contents', ['contents', 'toc', 'inhaltsverzeichnis']],
  ['LOF', 'List of figures', ['figures', 'lof', 'abbildungsverzeichnis']],
  ['LOT', 'List of tables', ['tables', 'lot', 'tabellenverzeichnis']],
  ['LOL', 'List of listings', ['listings', 'lol', 'listingverzeichnis']],
];

/**
 * insertItems are the items of the plugin in the insert menu and in the slash commands of a paper: `/cite`, `/research`
 * typed on the selected argument, which only the slash commands offer, and `/toc`, `/lof`, `/lot` and `/lol`, with the
 * names of the text editor.
 * @param tiptap - The Tiptap editor.
 */
function insertItems(tiptap: Editor): MenuItem[] {
  const items: MenuItem[] = [];
  if (canCite(tiptap)) {
    items.push({ id: 'cite', label: 'Cite a source', slash: 'cite', keywords: ['citation', 'source', 'zotero'], run: () => askCitation(tiptap) });
  }
  // The text before a slash typed on selected text, or the selected text, when the user types the slash on it.
  const { selection } = tiptap.state;
  const selected = slashSelection(tiptap.state) ?? (selection.empty ? undefined : selection);
  if (selected && tiptap.isEditable && isPaper(tiptap.state.doc) && researchPlaces(tiptap.state, selected)) {
    items.push({ id: 'paper-research', label: 'Research the evidence', slash: 'research', keywords: ['argument', 'evidence'], selection: true, run: () => void markResearch(tiptap) });
  }
  // The lists of the special sections, with the names of the text editor.
  if (canCite(tiptap)) {
    for (const [code, label, keywords] of listItems) {
      items.push({ id: `paper-${listCodes[code]}`, label, slash: listCodes[code], keywords, run: () => askList(tiptap, code) });
    }
  }
  return items;
}

/** formatButtons are the buttons of the plugin in the format bar: "Cite" and "Research" in a paper. */
const formatButtons: FormatButton[] = [
  { id: 'paper-cite', label: 'Cite a source after the selected text', text: 'Cite', isShown: canCite, run: askCitation },
  {
    id: 'paper-research',
    label: 'Research the evidence for the selected argument',
    text: 'Research',
    isShown: (tiptap) => isPaper(tiptap.state.doc) && researchPlaces(tiptap.state) !== undefined,
    run: (tiptap) => void markResearch(tiptap),
  },
];

/**
 * referenceView returns the read-only view of a reference of the front matter: a link that opens its clone on
 * Ctrl+click (Cmd+click on macOS) when the platform can open it, else its text.
 * @param tiptap - The Tiptap editor, or undefined.
 * @param text - The text of the reference.
 * @param message - The message that opens the clone, or undefined for a value without a clone.
 */
function referenceView(tiptap: Editor | undefined, text: string, message: PageMessage | undefined): HTMLElement {
  const view = document.createElement('span');
  view.className = 'nsmd-paper-reference';
  view.textContent = text;
  const channel = tiptap ? pages.get(tiptap)?.channel : undefined;
  if (message && channel) {
    view.classList.add('nsmd-paper-reference-link');
    view.tabIndex = 0;
    view.setAttribute('role', 'link');
    view.title = 'Ctrl+click (Cmd+click on macOS) opens the clone in a new window';
    const open = (event: MouseEvent | KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        channel.post(message);
      }
    };
    view.addEventListener('click', open);
    view.addEventListener('keydown', (event) => event.key === 'Enter' && open(event));
  }
  return view;
}

/**
 * frontMatterInputs are the inputs of `layout` and `repos`, which only the command mp writes: read-only, and
 * Ctrl+click on a reference to GitHub opens its clone.
 */
const frontMatterInputs: FrontMatterInput[] = [
  {
    key: 'layout',
    render: (value, context) => {
      const text = typeof value === 'string' ? value : String(value ?? '');
      return referenceView(context.editor, text, text.includes('/') ? { type: 'openReference', key: 'layout' } : undefined);
    },
  },
  {
    key: 'repos',
    render: (value, context) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return referenceView(context.editor, String(value ?? ''), undefined);
      }
      const list = document.createElement('div');
      list.className = 'nsmd-paper-repos';
      for (const [name, reference] of Object.entries(value as Record<string, unknown>)) {
        const row = document.createElement('div');
        row.append(`${name}: `, referenceView(context.editor, String(reference ?? ''), { type: 'openReference', key: 'repos', name }));
        list.append(row);
      }
      return list;
    },
  },
];

/**
 * activate starts the plugin in an editor: its links go to their targets, and with a channel to its part on the
 * platform it asks for the schema of the front matter and takes the answers of its requests.
 * @param editor - The editor.
 * @param host - The API of the platform.
 * @returns What to dispose.
 */
function activate(editor: PluginEditor, host?: PluginHost): () => void {
  const tiptap = editor.tiptap;
  const channel = host?.channel?.(pluginName);
  const page: Page = { editor, channel, schema: undefined, requests: 0, lists: new Map() };
  editors.add(tiptap);
  pages.set(tiptap, page);
  const stop = channel?.onMessage((value) => {
    const message = extensionMessage(value);
    if (message?.type === 'schema') {
      page.schema = (message.schema ?? undefined) as JsonSchema | undefined;
      editor.refreshPlugins();
    } else if (message?.type === 'citation' && message.id !== undefined && message.text !== undefined && !tiptap.isDestroyed) {
      insertCitation(tiptap, message.id, message.text);
    } else if (message?.type === 'listChange') {
      takeList(page, message.request, message.change);
    }
  });
  channel?.post({ type: 'hello' } satisfies PageMessage);
  // The form showed the front matter before the plugin started: it shows the links of the references now.
  if (channel) {
    editor.refreshPlugins();
  }
  return () => {
    stop?.();
    editors.delete(tiptap);
    pages.delete(tiptap);
  };
}

/** writeText writes the text of a hidden node as the file has it. */
const writeText = (state: { text(text: string, escape?: boolean): void }, node: PmNode): void => state.text(node.attrs.text as string, false);

/** paperPlugin is the plugin of the paper: the sources, the citations, the reference list and the lists of the special sections. */
export const paperPlugin: MarkdownPlugin = {
  name: pluginName,
  apiVersion: 1,
  extendMarkdownIt,
  styles,
  nodes: [PaperAnchor, ResearchMarker, SourcesComment, ListMarker, Guard],
  fromMarkdown: {
    [tokenTypes.anchor]: { node: nodeNames.anchor, getAttrs: (token) => ({ id: (token.meta as { id: string }).id, text: token.content }) },
    [tokenTypes.research]: { node: nodeNames.research, getAttrs: (token) => ({ text: token.content }) },
    [tokenTypes.sources]: { node: nodeNames.sources, getAttrs: (token) => ({ text: token.content }) },
    [tokenTypes.list]: {
      node: nodeNames.list,
      getAttrs: (token) => {
        const meta = token.meta as { code: string; edge: string };
        return { code: meta.code, edge: meta.edge, text: token.content };
      },
    },
  },
  toMarkdown: {
    nodes: {
      [nodeNames.anchor]: writeText,
      [nodeNames.research]: writeText,
      [nodeNames.sources]: (state, node) => {
        writeText(state, node);
        state.closeBlock(node);
      },
      [nodeNames.list]: (state, node) => {
        writeText(state, node);
        state.closeBlock(node);
      },
    },
  },
  generated: (doc) => analysisOf(doc).parts,
  frontMatterSchema: (tiptap) => pages.get(tiptap)?.schema,
  frontMatterInputs,
  menus: { insert: insertItems, format: formatButtons },
  activate,
};
