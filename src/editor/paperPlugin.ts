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
 *   source; each entry of the reference list; and each list between the markers of a special section, whose links
 *   Ctrl+click follows to their headings and captions. The user changes them through what they come from, and the
 *   format step writes them again when the file is saved.
 * - Backspace and Delete jump over the hidden anchors and markers in the line. A database of the sources that an edit of
 *   the user deleted goes back to the end of the document. Changes from outside, Undo and Redo pass.
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
import { type GeneratedPart, type MarkdownPlugin, outsideChange, type PluginEditor } from '@nimblescape/markdowneditor';
import { idPattern, listCodes, researchMark, sourcesName } from '../paper/marks';

/** pluginName is the name of the plugin. */
export const pluginName = 'paper';

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

/**
 * slugOf returns the GitHub ID of a heading from its text: the text in small letters, without the characters that are
 * no letter, digit, mark, `_`, `-` or space, and a `-` for each space. A second heading with the same ID gets `-1`.
 * @param text - The text of the heading.
 */
const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');

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
 * citationsOf returns the ranges of the texts of the links of a textblock to a source of the database.
 * @param block - The textblock.
 * @param pos - The position of the textblock.
 * @param ids - The identifiers of the sources.
 */
function citationsOf(block: PmNode, pos: number, ids: ReadonlySet<string>): { from: number; to: number; id: string }[] {
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
    if (mark && id !== undefined && ids.has(id)) {
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
  const citations: { from: number; to: number; id: string }[] = [];
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
    if (node.type.name === 'heading') {
      const slug = slugOf(node.textContent);
      const count = headingIds.get(slug) ?? 0;
      headingIds.set(slug, count + 1);
      const id = count === 0 ? slug : `${slug}-${count}`;
      if (!targets.has(id)) {
        targets.set(id, pos);
      }
    }
    node.forEach((child) => {
      // The anchors of the figures, the tables, the listings and the sections of Notes, and the anchors of the entries.
      const name = child.type.name === 'figureAnchor' ? (child.attrs.name as string) : undefined;
      if (name) {
        targets.set(name, pos);
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
    citations.push(...citationsOf(node, pos, ids));
    return false;
  });
  for (const list of lists) {
    parts.push({ from: list.from, to: list.to });
  }
  const inPart = (pos: number) => parts.some((part) => part.from <= pos && pos < part.to);
  for (const citation of citations) {
    if (!inPart(citation.from)) {
      parts.push({ from: citation.from, to: citation.to, open: () => (targets.has(citation.id) ? reveal(doc, targets.get(citation.id)!) : undefined) });
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

/** styles are the styles of the plugin: the database of the sources and the markers of the lists are hidden. */
export const styles = '.nsmd-paper-sources, .nsmd-paper-list-marker { display: none; }';

/**
 * activate adds an editor to the editors whose links go to their targets.
 * @param editor - The editor.
 * @returns What to dispose.
 */
function activate(editor: PluginEditor): () => void {
  const tiptap = editor.tiptap;
  editors.add(tiptap);
  return () => editors.delete(tiptap);
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
  activate,
};
