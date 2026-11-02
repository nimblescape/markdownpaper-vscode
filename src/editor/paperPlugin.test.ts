// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the plugin of the paper for the editor of nimblescape Markdown (src/editor/paperPlugin.ts, R-EDIT-001):
// the markup keeps its text byte for byte and is hidden, the parts that the format step writes are read-only, the
// links go to their targets, the guard keeps the database of the sources, and the renderer keeps only the anchors.

import { undo } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import { createMarkdownIt, MarkdownEditor } from '@nimblescape/markdowneditor';
import { afterEach, describe, expect, it } from 'vitest';
import { analysisOf, extendMarkdownIt, nodeNames, paperPlugin, sourceIds } from './paperPlugin';

let editors: MarkdownEditor[] = [];
afterEach(() => {
  editors.forEach((editor) => editor.destroy());
  editors = [];
  document.body.replaceChildren();
  document.head.querySelectorAll('style[data-nsmd-plugin]').forEach((style) => style.remove());
});

/** open returns an editor with a text and the plugin of the paper. */
function open(markdown: string): MarkdownEditor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new MarkdownEditor(element, { markdown, plugins: [paperPlugin] });
  editors.push(editor);
  return editor;
}

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

describe('the renderer', () => {
  it('keeps the anchors of the entries and leaves out the database, the markers of the lists and of the arguments', () => {
    const html = createMarkdownIt([extendMarkdownIt]).render(text.split('---\n\n')[1]);
    expect(html).toContain('<p><a id="doe2020"></a>Doe, J. (2020). <em>An example</em>.</p>');
    expect(html).toContain('<a href="#doe2020" title="page 3">Doe, 2020, S. 3</a>). Teams plan less (RESEARCH).');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('nimblescape-sources');
  });
});
