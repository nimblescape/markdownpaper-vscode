// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the script of the pages (media/paperPreview.js) in a browser without a window, in a page with the
 * parts of the Markdown preview of VS Code that the script uses: the data of the preview with its source, a style sheet
 * of the Markdown extension of VS Code and the style of the theme, the classes of a dark theme on the body, and a
 * small stand-in for the script of VS Code, which puts the content into the page after the scripts of the extensions
 * ran, and for each message `updateContent` changes the content and sends the event `vscode.markdown.updateContent`,
 * and a stand-in for the script of nimblescape PlantUML, which draws the PlantUML blocks of the markdown-it plugin of
 * its npm package into shadow roots after a while.
 * They need an installed Chrome, Chromium or Edge, as the PDF does; on the runners of GitHub there is one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extendMarkdownIt } from '@nimblescape/plantuml';
import type MarkdownIt from 'markdown-it';
import { afterAll, describe, expect, it } from 'vitest';
import { baseCss } from './paper/baseCss';
import { renderBody } from './paper/markdown';
import { compose, loadLayout, valuesOf } from './paper/render';
import { readFrontMatter } from './paper/frontMatter';
import { escapeHtml } from './paper/template';
import { findBrowser } from './pdf/browser';
import { Browser } from './pdf/cdp';
import { fileReader, folderUrl } from './pdf/export';

/** repository is the root folder of this repository. */
const repository = path.resolve(__dirname, '..');

/** browser is the installed browser, or undefined. */
const browser = (() => {
  try {
    return findBrowser();
  } catch {
    return undefined;
  }
})();

/** folder is the temporary folder of the page of the tests. */
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-preview-'));

afterAll(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

/**
 * paperContent returns the content `.markdown-body` of a paper document in the layout "plain", as the plugin of the
 * extension renders it in the Markdown preview: the hidden element with the layout first.
 * @param text - The Markdown text.
 */
async function paperContent(text: string): Promise<string> {
  const document = pathToFileURL(path.join(folder, 'paper.md')).href;
  const frontMatter = readFrontMatter(text);
  const loaded = await loadLayout({ reader: fileReader, builtinLayouts: folderUrl(path.join(repository, 'layouts')) }, document, frontMatter);
  const composed = compose(loaded, valuesOf(loaded.layout, frontMatter, document), (url) => url);
  // The Markdown preview of VS Code gives every block its line, also a fenced code block, which the renderer does not.
  const lines = (md: MarkdownIt) => {
    md.core.ruler.push('lines', (state) => {
      for (const token of state.tokens.filter((token) => token.type === 'fence' && token.map)) {
        token.attrSet('data-line', String(token.map![0]));
      }
    });
  };
  const body = renderBody(text.replace(/^---[\s\S]*?\n---\n/, ''), loaded.layout, undefined, [lines, (md) => extendMarkdownIt(md)]);
  const data = { layout: loaded.layout.id, language: loaded.layout.language, styles: [baseCss, ...composed.styles, composed.variables], before: composed.before, after: composed.after, attributes: composed.attributes, delay: 0 };
  // A diagram as the script of Mermaid of VS Code draws it: an SVG element whose style sheet names its ID.
  const diagram = '<pre class="mermaid" id="mermaid-1"><svg id="dmermaid-1"><style>#dmermaid-1 rect { fill: rgb(1, 2, 3); }</style><rect width="40" height="20"></rect></svg></pre>';
  return `<div class="markdown-body"><div class="nimblescape-paper" hidden data-paper="${escapeHtml(JSON.stringify(data))}"></div>\n${body.html}${diagram}</div>`;
}

/** page is the stand-in of the Markdown preview of VS Code, with the script and the style of the pages. */
function writePage(): string {
  fs.mkdirSync(path.join(folder, 'markdown-language-features'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'markdown-language-features', 'markdown.css'), 'body { padding: 0 26px; font-size: 14px; }\n');
  fs.copyFileSync(path.join(repository, 'media', 'paperPreview.js'), path.join(folder, 'paperPreview.js'));
  fs.copyFileSync(path.join(repository, 'media', 'paperPreview.css'), path.join(folder, 'paperPreview.css'));
  fs.copyFileSync(path.join(repository, 'media', 'paperHandlers.js'), path.join(folder, 'paperHandlers.js'));
  fs.copyFileSync(path.join(repository, 'node_modules', 'pagedjs', 'dist', 'paged.js'), path.join(folder, 'paged.js'));
  const file = path.join(folder, 'preview.html');
  fs.writeFileSync(
    file,
    `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style id="_defaultStyles">body { background: #1e1e1e; color: #ccc; }</style>
<meta id="vscode-markdown-preview-data" data-settings="${escapeHtml(JSON.stringify({ source: 'file:///paper.md' }))}">
<link rel="stylesheet" href="markdown-language-features/markdown.css">
<link rel="stylesheet" href="paperPreview.css">
</head>
<body class="vscode-body vscode-dark">
<script src="paperPreview.js"></script>
<script>
// The stand-in for the script of nimblescape PlantUML: it marks each new block as pending, and after half a second
// draws a diagram into the open shadow root of its content element and marks the block as drawn.
new MutationObserver(() => {
  for (const content of document.querySelectorAll('.markdown-body .nimblescape-plantuml-content:not([data-plantuml-state])')) {
    content.setAttribute('data-plantuml-state', 'pending');
    setTimeout(() => {
      const shadow = content.shadowRoot || content.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<svg part="diagram" width="80" height="30"><text x="5" y="20">Anna</text></svg>';
      content.setAttribute('data-plantuml-state', 'drawn');
    }, 500);
  }
}).observe(document.body, { childList: true, subtree: true });
window.messages = [];
window.rendered = [];
window.addEventListener('nimblescape-paper-rendered', (event) => window.rendered.push(event.detail.pages));
window.addEventListener('message', (event) => {
  if (event.data.type !== 'updateContent') {
    return;
  }
  window.messages.push(event.data);
  const next = new DOMParser().parseFromString(event.data.content, 'text/html').querySelector('.markdown-body');
  document.querySelector('.markdown-body').replaceWith(next);
  window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
});
window.show = (content) => {
  document.body.insertAdjacentHTML('beforeend', content);
};
</script>
</body>
</html>
`,
  );
  return file;
}

/**
 * evaluate returns the value of an expression in the page, after its promise.
 * @param session - The browser and the session of the page.
 * @param expression - The expression.
 */
async function evaluate<T>(session: { browser: Browser; id: string }, expression: string): Promise<T> {
  const result = (await session.browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session.id)) as { result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } };
  if (result.exceptionDetails) {
    throw new Error(`${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}: ${expression}`);
  }
  return result.result.value;
}

/** waitFor is the text of a promise that waits until an expression of the page is true, at most 30 seconds. */
const waitFor = (condition: string): string =>
  `new Promise((resolve, reject) => { const end = Date.now() + 30000; const check = () => { if (${condition}) { resolve(true); } else if (Date.now() > end) { reject(new Error('timeout')); } else { setTimeout(check, 50); } }; check(); })`;

describe('the script of the pages in the Markdown preview (R-PRV-001 to R-PRV-006)', () => {
  it.skipIf(!browser)('makes the pages of a paper document before the hidden content, as white paper, and gives the preview back for a notes document', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${`${paragraph}\n\n`.repeat(20)}## Methode\n\nText.\n\n\`\`\`plantuml\nAnna -> Bernd\n\`\`\`\n`;
    const paper = await paperContent(text);
    const page = writePage();
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      await running.send('Page.enable', {}, sessionId);
      const loaded = running.once('Page.loadEventFired', sessionId);
      await running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);
      await loaded;

      // VS Code puts the first content into the page after the scripts of the extensions, without an event.
      await evaluate(session, `window.show(${JSON.stringify(paper)})`);
      await evaluate(session, waitFor('window.rendered.length > 0'));
      const state = await evaluate<{
        pages: number;
        before: boolean;
        light: boolean;
        dark: boolean;
        vscodeSheets: boolean[];
        lines: number;
        hidden: string;
        echo: { source: string; same: boolean } | undefined;
        heading: string;
        fits: boolean;
        diagram: { mermaid: number; id: string; fill: string };
        plantUml: { blocks: number; diagram: string | undefined; line: boolean; originals: number; includes: number };
      }>(
        session,
        `(() => {
          const pages = document.querySelector('.nimblescape-paper-pages');
          const body = document.querySelector('.markdown-body');
          const echo = window.messages[0];
          return {
            pages: pages.querySelectorAll('.pagedjs_page').length,
            before: Boolean(pages.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING),
            light: document.body.classList.contains('vscode-light'),
            dark: document.body.classList.contains('vscode-dark'),
            vscodeSheets: [document.getElementById('_defaultStyles').sheet.disabled, document.querySelector('link[href*="markdown-language-features"]').disabled],
            lines: pages.querySelectorAll('[data-line]').length,
            hidden: getComputedStyle(body).visibility,
            echo: echo && { source: echo.source, same: echo.content.includes('Einleitung') },
            heading: pages.querySelector('h1').textContent,
            fits: pages.querySelector('.pagedjs_page').getBoundingClientRect().right <= document.documentElement.clientWidth,
            diagram: {
              mermaid: pages.querySelectorAll('.mermaid').length,
              id: pages.querySelector('svg[id*="mermaid"]').id,
              fill: getComputedStyle(pages.querySelector('svg rect')).fill,
            },
            plantUml: {
              blocks: pages.querySelectorAll('.nimblescape-paper-plantuml').length,
              diagram: pages.querySelector('.nimblescape-paper-plantuml > svg[part~="diagram"]')?.textContent,
              line: pages.querySelector('.nimblescape-paper-plantuml').hasAttribute('data-line'),
              originals: pages.querySelectorAll('.nimblescape-plantuml').length,
              includes: pages.querySelectorAll('.nimblescape-plantuml-page-includes').length,
            },
          };
        })()`,
      );
      expect(state.pages).toBeGreaterThan(1);
      expect(state.before).toBe(true);
      expect(state.light).toBe(true);
      expect(state.dark).toBe(false);
      expect(state.vscodeSheets).toEqual([true, true]);
      expect(state.lines).toBeGreaterThan(2);
      expect(state.hidden).toBe('hidden');
      // The script sends the content once more, so that VS Code reads the lines of the pages.
      expect(state.echo).toEqual({ source: 'file:///paper.md', same: true });
      expect(state.heading).toContain('1');
      expect(state.heading).toContain('Einleitung');
      // The pages are as wide as the preview.
      expect(state.fits).toBe(true);
      // The script of Mermaid does not find the diagrams on the pages, which keep their style.
      expect(state.diagram).toEqual({ mermaid: 0, id: 'nimblescape-paper-dmermaid-1', fill: 'rgb(1, 2, 3)' });
      // The pages wait for the PlantUML diagram and show a copy of it, with the line of the block for the scrolling.
      expect(state.plantUml).toEqual({ blocks: 1, diagram: 'Anna', line: true, originals: 0, includes: 0 });

      // A notes document in the same preview: no pages, and the preview as VS Code shows it.
      await evaluate(
        session,
        `window.postMessage({ type: 'updateContent', source: 'file:///notes.md', content: '<!DOCTYPE html><html><body><div class="markdown-body"><h1 data-line="0" class="code-line">Notizen</h1></div></body></html>' }, '*')`,
      );
      await evaluate(session, waitFor("!document.body.classList.contains('nimblescape-paper-mode')"));
      const notes = await evaluate<{ pages: number; dark: boolean; vscodeSheets: boolean[] }>(
        session,
        `({
          pages: document.querySelectorAll('.nimblescape-paper-pages, .pagedjs_page').length,
          dark: document.body.classList.contains('vscode-dark'),
          vscodeSheets: [document.getElementById('_defaultStyles').sheet.disabled, document.querySelector('link[href*="markdown-language-features"]').disabled],
        })`,
      );
      expect(notes).toEqual({ pages: 0, dark: true, vscodeSheets: [false, false] });
    } finally {
      await running.close();
    }
  });
});
