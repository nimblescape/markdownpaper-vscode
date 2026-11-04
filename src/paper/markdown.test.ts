// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// These tests check the parts of Markdown Paper in the text of the pages: the notes, the arguments to research, the
// cites of the listings and the markdown-it plugins of other extensions. The tests of @nimblescape/markdownlayout
// check the rest of the text of the pages, such as the numbers, the captions, the footnotes and the lists.

import { hyphenatorOf, type Layout, layoutEnvKey, softHyphen, termsFor } from '@nimblescape/markdownlayout';
import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { type MarkdownPlugin, paperEnvKey, paperTextPlugin, renderBody } from './markdown';

/**
 * layoutOf returns a layout for the tests.
 * @param changes - The fields that differ from the defaults.
 */
const layoutOf = (changes: Partial<Layout> = {}): Layout => ({
  id: 'test',
  folder: 'file:///layouts/test/',
  name: 'Test',
  language: 'de-AT',
  stylesheets: [],
  before: [],
  after: [],
  fields: {},
  numbered: true,
  depth: 3,
  unnumbered: [],
  numberedSections: [],
  contentsDepth: 3,
  contentsFront: true,
  hyphenate: false,
  references: { hyphenate: false },
  listings: { lineNumbers: false },
  pdfName: '{{file}}',
  terms: termsFor('de-AT'),
  ...changes,
});

/** example is the example of docs/format.md of nimblescape Markdown Notes, version 1.0.0, with a footnote of its own. */
const example = `<!-- nimblescape-markdown-notes v1.0.0 spec=https://github.com/nimblescape/markdownnotes-vscode/blob/main/docs/format.md
This comment marks a Markdown file with notes of the VS Code extension nimblescape Markdown Notes.
-->

# Title

The agents <wbr><!--[note-7k2q green-->change the work of teams[^note-7k2q] in three ways.[^ways]

[^note-7k2q]: **hannes** · 2026-10-28 10:15+01:00

    Which three ways?

    > **anna** · 2026-10-28 11:02+01:00
    >
    > The ways of the plan.

[^ways]: Planning, writing and checking.

The next paragraph.
`;

describe('notes of nimblescape Markdown Notes (R-REN-002)', () => {
  test('the pages leave out the start markers, the references and the definitions of the notes, and keep the paragraph', () => {
    const body = renderBody(example, layoutOf());
    expect(body.notes).toBe(1);
    expect(body.html).not.toContain('note-7k2q');
    expect(body.html).not.toContain('Which three ways');
    expect(body.html).not.toContain('<wbr>');
    expect(body.html).toContain('The agents change the work of teams in three ways.');
    expect(body.html).toContain('<p data-line="18">The next paragraph.</p>');
  });

  test('the pages leave out the start marker of an argument to research and keep its "(RESEARCH)" (R-CITE-002)', () => {
    const body = renderBody('<wbr><!--[research-->Feedback changes learning (RESEARCH).\n', layoutOf());
    expect(body.html).toContain('>Feedback changes learning (RESEARCH).</p>');
    expect(body.html).not.toContain('research--');
    expect(body.html).not.toContain('<wbr>');
  });

  test('a footnote of the document goes to the place of its reference, numbered without the notes', () => {
    const body = renderBody(example, layoutOf());
    expect(body.footnotes).toBe(1);
    expect(body.html).toContain('three ways.<span class="footnote"><span class="footnote-paragraph" id="paper-footnote-1">Planning, writing and checking.</span></span>');
    expect(body.html).not.toContain('footnotes-sep');
  });

  test('a reference of a note in a code span stays as it is', () => {
    expect(renderBody('Write `[^note-7k2q]` for a note.\n', layoutOf()).html).toContain('<code>[^note-7k2q]</code>');
  });

  test('without the environment of the layout, as in a notes document, the plugin changes nothing', () => {
    const md = new MarkdownIt({ html: true });
    void paperTextPlugin.extendMarkdownIt?.(md);
    const text = 'The agents <wbr><!--[note-7k2q green-->change the work.\n';
    expect(md.render(text, {})).toBe(new MarkdownIt({ html: true }).render(text));
  });
});

describe('the cites of the listings (R-REN-011, R-PDF-005)', () => {
  /** listing is a listing of a snippet with the link of its caption to its source and the cite of the file. */
  const listing = [
    'Wie [Listing 9](#lst-reading-fields) zeigt.',
    '',
    'Listing 1: [Reading the fields](../src/fields.ts#L12-L30) (fields.ts, L12-L30)<a id="lst-reading-fields"></a>',
    '',
    '<!-- listing: ../src/fields.ts#read-fields -->',
    '',
    '```typescript',
    'export function readFields() {',
    '  return 1;',
    '}',
    '```',
    '',
    'Listing 2: Die ganze Datei',
    '<!-- listing: ../src/my%20server.ts -->',
    '```ts',
    'const a = 1;',
    '```',
    '',
  ].join('\n');

  test('the caption of a listing shows the text of its link, and the cite of the file goes after the caption', () => {
    const body = renderBody(listing, layoutOf(), hyphenatorOf('de-AT'));
    expect(body.listings).toEqual([
      { id: 'lst-reading-fields', label: 'Listing 1', text: 'Reading the fields', line: 2 },
      { id: 'listing-2', label: 'Listing 2', text: 'Die ganze Datei', line: 12 },
    ]);
    expect(body.html).toContain(
      '<span class="caption-label">Listing 1</span><span class="caption-separator">: </span>' +
        '<span class="caption-text">Reading the fields</span><span class="caption-source"> (fields.ts, L12-L30)</span></p>',
    );
    // A caption without the cite of the file shows none: the renderer adds no cite of its own.
    expect(body.html).toContain('<span class="caption-text">Die ganze Datei</span></p>');
    expect(body.html).toContain('Wie <a href="#lst-reading-fields">Listing 1</a> zeigt.');
    expect(body.html).not.toContain('href="../src');
  });

  test('the cite of a file whose name looks like an address stays text, and the list of listings has the caption without the cite', () => {
    const markdown = 'Listing 1: [Der Server](../src/server.py) (server.py)\n\n<!-- listing: ../src/server.py -->\n\n```python\nrun()\n```\n';
    const body = renderBody(markdown, layoutOf());
    expect(body.html).toContain('<span class="caption-text">Der Server</span><span class="caption-source"> (server.py)</span></p>');
    expect(body.listings.map((found) => found.text)).toEqual(['Der Server']);
  });

  test('a listing of a public repository has the link to its lines on its cite, with the address in a footnote; a private one has none', () => {
    const address = 'https://github.com/Org/Server/blob/0123456789abcdef0123456789abcdef01234567/src/api.ts#L12-L30';
    const markdown = (repository: string): string =>
      `Listing 1: [Reading the API](${address.replace('Org/Server', repository)}) (api.ts, L12-L30)<a id="lst-api"></a>\n\n<!-- listing: server:src/api.ts#read -->\n\n\`\`\`ts\nread();\n\`\`\`\n`;
    const shown = renderBody(markdown('Org/Server'), layoutOf(), undefined, [], {}, ['org/server']);
    expect(shown.html).toContain(
      '<span class="caption-text">Reading the API</span><span class="caption-source"> ' +
        `<a href="${address}">(api.ts, L12-L30)</a><span class="footnote link-footnote"><span class="footnote-paragraph" id="paper-footnote-1"><a class="link-address" href="${address}">${address}</a></span></span></span></p>`,
    );
    expect(shown.listings.map((found) => found.text)).toEqual(['Reading the API']);
    for (const hidden of [renderBody(markdown('Org/Server'), layoutOf()), renderBody(markdown('org/tools'), layoutOf(), undefined, [], {}, ['org/server'])]) {
      expect(hidden.html).toContain('<span class="caption-text">Reading the API</span><span class="caption-source"> (api.ts, L12-L30)</span></p>');
      expect(hidden.footnotes).toBe(0);
    }
  });

});

describe('the markdown-it plugins of other extensions (R-REN-010)', () => {
  /** mermaid is a plugin like the one of Mermaid in VS Code: a fence `mermaid` becomes a div that its script draws. */
  const mermaid: MarkdownPlugin = (md) => {
    const fence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, index, options, env, self) =>
      tokens[index].info.trim() === 'mermaid' ? `<div class="mermaid">${md.utils.escapeHtml(tokens[index].content)}</div>\n` : (fence?.(tokens, index, options, env, self) ?? '');
    return md;
  };

  test('the plugins of other extensions work before the rules of the paper and of the layout, and their content gets no soft hyphens', () => {
    const markdown = '# Einleitung\n\n```mermaid\nflowchart LR\n  Wirtschaftspädagogik --> Unterrichtsplanung\n```\n\nWirtschaftspädagogik ist ein Fach.\n';
    const body = renderBody(markdown, layoutOf(), hyphenatorOf('de-AT'), [mermaid]);
    expect(body.html).toContain('<div class="mermaid">flowchart LR\n  Wirtschaftspädagogik --&gt; Unterrichtsplanung\n</div>');
    expect(body.html).toContain(`Wirt${softHyphen}schafts`);
    expect(body.html).toContain('<span class="heading-number">1</span> Einleitung');
  });

  test('the plugins find the values of the environment, such as currentDocument', () => {
    let seen: unknown;
    const spy: MarkdownPlugin = (md) => {
      md.core.ruler.push('spy', (state) => {
        seen = (state.env as Record<string, unknown>).currentDocument;
        expect((state.env as Record<string, unknown>)[layoutEnvKey]).toBeDefined();
        expect((state.env as Record<string, unknown>)[paperEnvKey]).toBeDefined();
      });
    };
    renderBody('Text\n', layoutOf(), undefined, [spy], { currentDocument: 'file:///paper.md' });
    expect(seen).toBe('file:///paper.md');
  });
});
