// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the plugin of the paper for the editor of nimblescape Markdown (src/editor/paperPlugin.ts, R-EDIT-001):
// the markup keeps its text byte for byte and is hidden, the parts that the format step writes are read-only, the
// links go to their targets, the guard keeps the database of the sources, the renderer keeps only the anchors, and with
// a channel to its part on the platform the plugin takes the schema of the layout, opens the clones of the references
// of the front matter and inserts the citations that the user chooses there; "Research" marks a selected argument.

import { undo } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import { createMarkdownIt, MarkdownEditor, type PluginChannel } from '@nimblescape/markdowneditor';
import { afterEach, describe, expect, it } from 'vitest';
import { frontMatterSchemaOf } from '../paper/frontMatterSchema';
import { analysisOf, extendMarkdownIt, insertCitation, isPaper, markResearch, nodeNames, paperPlugin, researchPlaces, sourceIds } from './paperPlugin';

let editors: MarkdownEditor[] = [];
afterEach(() => {
  editors.forEach((editor) => editor.destroy());
  editors = [];
  document.body.replaceChildren();
  document.head.querySelectorAll('style[data-nsmd-plugin]').forEach((style) => style.remove());
});

/** Platform is a fake part of the plugin on the platform: the messages of the page, and a function that answers. */
interface Platform {
  readonly sent: unknown[];
  send(message: unknown): void;
}

/**
 * open returns an editor with a text and the plugin of the paper, with a channel to a fake platform when one is given.
 * @param markdown - The text.
 * @param platform - The fake platform, which this function fills.
 */
function open(markdown: string, platform?: { sent: unknown[]; send?: (message: unknown) => void }): MarkdownEditor {
  const element = document.createElement('div');
  document.body.append(element);
  const listeners = new Set<(message: unknown) => void>();
  const channel: PluginChannel = {
    post: (message) => platform?.sent.push(message),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  if (platform) {
    platform.send = (message) => listeners.forEach((listener) => listener(message));
  }
  const host = platform ? { platform: 'vscode', channel: (name: string) => (name === 'paper' ? channel : undefined) } : undefined;
  const editor = new MarkdownEditor(element, { markdown, plugins: [paperPlugin], ...(host ? { host } : {}) });
  editors.push(editor);
  return editor;
}

/** platformOf returns a fake platform for open. */
const platformOf = (): Platform & { send: (message: unknown) => void } => {
  const platform = { sent: [] as unknown[], send: (_message: unknown) => undefined as void };
  return platform;
};

/** field returns the row of a key of the form of the front matter. */
const field = (key: string): HTMLElement | null => document.querySelector(`.nsmd-fm [data-path='${JSON.stringify([key])}']`);

/** positionOf returns the position of the document before a text, or after it with `after`. */
function positionOf(editor: MarkdownEditor, text: string, after = false): number {
  let found = -1;
  editor.tiptap.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) {
      found = pos + node.text!.indexOf(text) + (after ? text.length : 0);
    }
    return found < 0;
  });
  if (found < 0) {
    throw new Error(`No text ${text}`);
  }
  return found;
}

/** select puts the cursor at a position of the document. */
function select(editor: MarkdownEditor, pos: number): void {
  const { view } = editor.tiptap;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** key sends a key to the editor as the browser does, and returns true when the editor used it. */
function key(editor: MarkdownEditor, name: string): boolean {
  const { view } = editor.tiptap;
  return view.someProp('handleKeyDown', (handle) => handle(view, new KeyboardEvent('keydown', { key: name }))) ?? false;
}

/** click sends Ctrl+click at a position of the document, and returns true when the editor used it. */
function ctrlClick(editor: MarkdownEditor, pos: number): boolean {
  const { view } = editor.tiptap;
  return view.someProp('handleClick', (handle) => handle(view, pos, new MouseEvent('click', { ctrlKey: true }))) ?? false;
}

/** generatedTexts returns the texts of the generated parts of an editor, in their order. */
function generatedTexts(editor: MarkdownEditor): string[] {
  const doc = editor.tiptap.state.doc;
  return analysisOf(doc).parts.map((part) => doc.textBetween(part.from, part.to, '|'));
}

/** text is a paper with a table of contents, citations, an argument to research, a reference list and the database. */
const text = [
  '---',
  'layout: plain',
  '---',
  '',
  '# Inhaltsverzeichnis',
  '',
  '<!-- toc -->',
  '- [1 Einleitung](#einleitung)',
  '- [2 Methoden](#methoden)',
  '<!-- /toc -->',
  '',
  '# Einleitung',
  '',
  'Teams change ([Doe, 2020, S. 3](#doe2020 "page 3")). <wbr><!--[research-->Teams plan less (RESEARCH).',
  '',
  '# Methoden',
  '',
  '[Doe (2020)](#doe2020 "narrative") describes three ways, see [the plan](#nobody).',
  '',
  '# Literaturverzeichnis',
  '',
  '<a id="doe2020"></a>Doe, J. (2020). *An example*.',
  '',
  '<!-- nimblescape-sources',
  '{"id":"doe2020","type":"book","title":"An example"}',
  '-->',
  '',
].join('\n');

describe('the markup', () => {
  it('keeps the text of the file byte for byte, also after an edit of another block', () => {
    const editor = open(text);
    expect(editor.getMarkdown()).toBe(text);
    select(editor, positionOf(editor, 'describes'));
    editor.tiptap.view.dispatch(editor.tiptap.state.tr.insertText('now '));
    expect(editor.getMarkdown()).toBe(text.replace('describes three', 'now describes three'));
  });

  it('hides the database, the markers of the list, the anchor of the entry and the marker of the argument to research', () => {
    const editor = open(text);
    const names: string[] = [];
    editor.tiptap.state.doc.descendants((node) => {
      names.push(node.type.name);
      return true;
    });
    expect(names.filter((name) => name === nodeNames.sources)).toHaveLength(1);
    expect(names.filter((name) => name === nodeNames.list)).toHaveLength(2);
    expect(names.filter((name) => name === nodeNames.anchor)).toHaveLength(1);
    expect(names.filter((name) => name === nodeNames.research)).toHaveLength(1);
    expect(names).not.toContain('htmlInline');
    expect(names).not.toContain('htmlBlock');
    const shown = document.body.textContent ?? '';
    for (const markup of ['<!--', '<a id', '<wbr>', 'nimblescape-sources']) {
      expect(shown).not.toContain(markup);
    }
    expect(shown).toContain('Teams plan less (RESEARCH).');
  });

  it('keeps an anchor inside a line and a comment that is no database as HTML', () => {
    const other = 'A <a id="doe2020"></a> anchor.\n\n<!-- other -->\n';
    const editor = open(other);
    expect(editor.getMarkdown()).toBe(other);
    const names: string[] = [];
    editor.tiptap.state.doc.descendants((node) => {
      names.push(node.type.name);
      return true;
    });
    expect(names).not.toContain(nodeNames.anchor);
    expect(names).not.toContain(nodeNames.sources);
  });
});

describe('the generated parts', () => {
  it('are the list of the table of contents, the citations of the sources of the database and their entries', () => {
    const editor = open(text);
    expect(generatedTexts(editor)).toEqual(['1 Einleitung|2 Methoden', 'Doe, 2020, S. 3', 'Doe (2020)', 'Doe, J. (2020). An example.']);
    // "the plan" goes to no source: the user writes it.
    expect(sourceIds('<!-- nimblescape-sources\n{"id":"doe2020"}\nno JSON\n{"id":"-bad"}\n-->')).toEqual(new Set(['doe2020']));
  });

  it('drop typing in a part, and let the user edit the text around them', () => {
    const editor = open(text);
    const { view } = editor.tiptap;
    for (const inside of [positionOf(editor, 'Doe, 2020') + 2, positionOf(editor, 'Doe, J.') + 2, positionOf(editor, '2 Methoden') + 2]) {
      view.dispatch(view.state.tr.insertText('x', inside));
    }
    expect(editor.getMarkdown()).toBe(text);
    select(editor, positionOf(editor, 'Teams change', true));
    view.dispatch(view.state.tr.insertText(' a lot'));
    expect(editor.getMarkdown()).toBe(text.replace('Teams change (', 'Teams change a lot ('));
  });

  it('go to their targets with Ctrl+click: a citation to its entry, a link of the list to its heading', () => {
    const editor = open(text);
    const { view } = editor.tiptap;
    expect(ctrlClick(editor, positionOf(editor, '2 Methoden') + 2)).toBe(true);
    expect(view.state.selection.$head.parent.textContent).toBe('Methoden');
    expect(ctrlClick(editor, positionOf(editor, 'Doe, 2020') + 2)).toBe(true);
    const entry = analysisOf(view.state.doc).parts.find((part) => view.state.doc.textBetween(part.from, part.to).startsWith('Doe, J.'))!;
    const head = view.state.selection.head;
    expect(Math.min(Math.abs(head - entry.from), Math.abs(head - entry.to))).toBeLessThanOrEqual(2);
    expect(ctrlClick(editor, positionOf(editor, 'the plan') + 2)).toBe(false);
  });
});

describe('the guard', () => {
  it('puts the database back at the end after the user deleted it, and Undo brings back the text', () => {
    const editor = open(text);
    const { view } = editor.tiptap;
    view.dispatch(view.state.tr.delete(positionOf(editor, 'Literaturverzeichnis') - 1, view.state.doc.content.size));
    expect(editor.getMarkdown()).toContain('\n<!-- nimblescape-sources\n{"id":"doe2020","type":"book","title":"An example"}\n-->\n');
    expect(editor.getMarkdown()).not.toContain('Literaturverzeichnis');
    undo(view.state, view.dispatch);
    expect(editor.getMarkdown()).toBe(text);
  });

  it('jumps over the marker of an argument to research with Backspace', () => {
    const editor = open(text);
    const { view } = editor.tiptap;
    select(editor, positionOf(editor, 'Teams plan'));
    key(editor, 'Backspace');
    // The key moves the cursor before the marker, and the browser deletes the character before it.
    expect(view.state.selection.head).toBe(positionOf(editor, 'Teams plan') - 1);
  });
});

/** paper is a short paper with a reference of its layout to GitHub, a reference in `repos` and a source. */
const paper = [
  '---',
  'layout: org/layouts@v1/thesis',
  'repos:',
  '  server: org/server@main',
  'title: Teams',
  '---',
  '',
  'Teams change. Teams plan less, and they talk more.',
  '',
  '<!-- nimblescape-sources',
  '{"id":"doe2020","type":"book","title":"An example"}',
  '-->',
  '',
].join('\n');

describe('the part on the platform', () => {
  it('asks for the schema of the layout, and the form of the front matter takes it', () => {
    const platform = platformOf();
    open(paper, platform);
    expect(platform.sent).toEqual([{ type: 'hello' }]);
    expect(field('author')).toBeNull();
    const schema = frontMatterSchemaOf({ name: 'Thesis', language: 'de-AT', fields: { title: { description: 'Der Titel.', required: true }, author: { description: 'Die Person.', required: false } } });
    platform.send({ type: 'schema', schema });
    expect(field('author')).not.toBeNull();
    expect(field('lang')?.querySelector<HTMLInputElement>('input')?.placeholder).toBe('de-AT');
    platform.send({ type: 'schema', schema: null });
    expect(field('author')).toBeNull();
  });

  it('shows layout and repos read-only, and Ctrl+click on a reference opens its clone', () => {
    const platform = platformOf();
    open(paper, platform);
    const layout = field('layout')?.querySelector<HTMLElement>('.nsmd-paper-reference-link');
    expect(layout?.textContent).toBe('org/layouts@v1/thesis');
    expect(field('layout')?.querySelector('[data-focus^="value"]')).toBeNull();
    layout!.click();
    expect(platform.sent).toEqual([{ type: 'hello' }]);
    layout!.dispatchEvent(new MouseEvent('click', { ctrlKey: true }));
    const server = field('repos')?.querySelector<HTMLElement>('.nsmd-paper-reference-link');
    expect(server?.textContent).toBe('org/server@main');
    server!.dispatchEvent(new MouseEvent('click', { metaKey: true }));
    expect(platform.sent.slice(1)).toEqual([
      { type: 'openReference', key: 'layout' },
      { type: 'openReference', key: 'repos', name: 'server' },
    ]);
  });

  it('shows a reference without a clone as its text, and without a platform no link', () => {
    open(paper.replace('org/layouts@v1/thesis', 'thesis'), platformOf());
    expect(field('layout')?.querySelector('.nsmd-paper-reference')?.textContent).toBe('thesis');
    expect(field('layout')?.querySelector('.nsmd-paper-reference-link')).toBeNull();
    editors.pop()!.destroy();
    document.body.replaceChildren();
    open(paper);
    expect(field('repos')?.querySelector('.nsmd-paper-reference-link')).toBeNull();
  });

  it('offers /cite in a paper, and inserts the citation that the platform answers after a word', () => {
    const platform = platformOf();
    const editor = open(paper, platform);
    const items = paperPlugin.menus!.insert!(editor.tiptap);
    expect(items.map((item) => item.hint)).toEqual(['/cite']);
    select(editor, positionOf(editor, 'Teams change', true));
    items[0].run();
    expect(platform.sent[1]).toEqual({ type: 'cite', request: 1 });
    platform.send({ type: 'citation', request: 1 });
    expect(editor.getMarkdown()).toBe(paper);
    platform.send({ type: 'citation', request: 1, id: 'doe2020', text: 'Doe, 2020' });
    expect(editor.getMarkdown()).toBe(paper.replace('Teams change.', 'Teams change ([Doe, 2020](#doe2020)).'));
    // The new citation is a generated part.
    expect(generatedTexts(editor)).toEqual(['Doe, 2020']);
    expect(paperPlugin.menus!.insert!(open('# A note\n', platformOf()).tiptap)).toEqual([]);
    expect(paperPlugin.menus!.insert!(open(paper).tiptap)).toEqual([]);
  });

  it('inserts a citation after a space or a parenthesis without a space before it', () => {
    const editor = open(paper);
    select(editor, positionOf(editor, 'Teams plan'));
    expect(insertCitation(editor.tiptap, 'doe2020', 'Doe, 2020')).toBe(true);
    expect(insertCitation(editor.tiptap, '-bad', 'Bad')).toBe(false);
    expect(editor.getMarkdown()).toContain('Teams change. ([Doe, 2020](#doe2020))Teams plan');
  });
});

describe('Research', () => {
  it('marks the selected argument, before the punctuation mark at its end', () => {
    const editor = open(paper);
    const { view } = editor.tiptap;
    const start = positionOf(editor, 'Teams plan');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, positionOf(editor, 'talk more.', true))));
    expect(researchPlaces(view.state)).toEqual({ start, end: positionOf(editor, 'talk more', true) });
    expect(markResearch(editor.tiptap)).toBe(true);
    expect(editor.getMarkdown()).toBe(paper.replace('Teams plan less, and they talk more.', '<wbr><!--[research-->Teams plan less, and they talk more (RESEARCH).'));
    // The marked argument holds a mark now.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start - 1, positionOf(editor, '(RESEARCH)', true))));
    expect(researchPlaces(view.state)).toBeUndefined();
    expect(markResearch(editor.tiptap)).toBe(false);
  });

  it('shows its button and Cite only in a paper, Cite only with a platform', () => {
    const shown = (editor: MarkdownEditor) => paperPlugin.menus!.format!.filter((button) => button.isShown?.(editor.tiptap)).map((button) => button.text);
    const selectText = (editor: MarkdownEditor, text: string) => {
      const { view } = editor.tiptap;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, positionOf(editor, text), positionOf(editor, text, true))));
    };
    const withPlatform = open(paper, platformOf());
    selectText(withPlatform, 'Teams plan less');
    expect(shown(withPlatform)).toEqual(['Cite', 'Research']);
    const alone = open(paper);
    selectText(alone, 'Teams plan less');
    expect(shown(alone)).toEqual(['Research']);
    const note = open('A note on teams.\n', platformOf());
    selectText(note, 'note on');
    expect(isPaper(note.tiptap.state.doc)).toBe(false);
    expect(shown(note)).toEqual([]);
  });
});

describe('the renderer', () => {
  it('keeps the anchors of the entries and leaves out the database, the markers of the lists and of the arguments', () => {
    const html = createMarkdownIt([extendMarkdownIt]).render(text.split('---\n\n')[1]);
    expect(html).toContain('<p><a id="doe2020"></a>Doe, J. (2020). <em>An example</em>.</p>');
    expect(html).toContain('<a href="#doe2020" title="page 3">Doe, 2020, S. 3</a>). Teams plan less (RESEARCH).');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('nimblescape-sources');
  });
});
