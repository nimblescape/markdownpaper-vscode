// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the script of the pages (media/paperPreview.js) in a browser without a window, in a page with the
 * parts of the Markdown preview of VS Code that the script uses: the data of the preview with its source, a style sheet
 * of the Markdown extension of VS Code, a style sheet of the setting `markdown.styles` and the style of the theme, the classes of a dark theme on the body, and a
 * small stand-in for the script of VS Code, which puts the content into the page after the scripts of the extensions
 * ran, and for each message `updateContent` changes the content and sends the event `vscode.markdown.updateContent`,
 * and a stand-in for the script of nimblescape PlantUML, which draws the PlantUML blocks of the markdown-it plugin of
 * its npm package into shadow roots after a while. The page also has style sheets of other extensions: one of
 * "Markdown Preview Github Styling", one that sets the color of every paragraph, and one of Markdown Notes.
 * They need an installed Chrome, Chromium or Edge, as the PDF does; on the runners of GitHub there is one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { baseCss, compose, escapeHtml, layoutScript, valuesOf } from '@nimblescape/markdownlayout';
import { Browser, fileReader, folderUrl } from '@nimblescape/markdownlayout/pdf';
import { extendMarkdownIt } from '@nimblescape/plantuml';
import { afterAll, describe, expect, it } from 'vitest';
import { readFrontMatter } from './paper/frontMatter';
import { renderBody } from './paper/markdown';
import { loadLayout } from './paper/render';
import { findBrowser } from './pdf/browser';

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
 * githubWrapper puts the HTML of a rendering into the elements of the markdown-it plugin of "Markdown Preview Github
 * Styling" (bierner.markdown-preview-github-styles 2.2.0), which wraps the whole HTML of the Markdown preview.
 * @param html - The HTML.
 */
const githubWrapper = (html: string): string =>
  `<div\n            class="github-markdown-body"\n            data-color-mode="auto"\n            data-light-theme="light"\n            data-dark-theme="dark"\n        >\n            <div class="github-markdown-content">${html}</div>\n        </div>`;

/** notesStyle is the stand-in for the style sheet of Markdown Notes in the preview, which stays on. */
const notesStyle = 'nimblescape.nimblescape-markdownnotes/media/markdownPreview.css';

/** extensionStyle is the stand-in for a style sheet of another extension in the page of the PDF, for inline code. */
const extensionStyle = 'code { color: rgb(1, 2, 3); }';

/**
 * paperContent returns the content `.markdown-body` of a paper document in the layout "plain", as the plugin of the
 * extension renders it in the Markdown preview: the hidden element with the layout and the style sheets of the page of
 * the PDF, then the element with the text of the renderer of the PDF.
 * @param text - The Markdown text.
 * @param wrap - The elements that the plugin of another extension puts around the whole HTML, if any.
 */
async function paperContent(text: string, wrap: (html: string) => string = (html) => html): Promise<string> {
  const document = pathToFileURL(path.join(folder, 'paper.md')).href;
  const frontMatter = readFrontMatter(text);
  const loaded = await loadLayout({ reader: fileReader, builtinLayouts: folderUrl(path.join(repository, 'layouts')) }, document, frontMatter);
  const composed = compose(loaded, valuesOf(loaded.layout, frontMatter?.values ?? {}, document), (url) => url);
  const body = renderBody(text.replace(/^---[\s\S]*?\n---\n/, ''), loaded.layout, undefined, [(md) => extendMarkdownIt(md)]);
  const data = {
    layout: loaded.layout.id,
    language: loaded.layout.language,
    styles: [extensionStyle, baseCss, ...composed.styles, composed.variables],
    before: composed.before,
    after: composed.after,
    attributes: composed.attributes,
    delay: 0,
    keep: [pathToFileURL(path.join(folder, 'paperPreview.css')).href, pathToFileURL(path.join(folder, notesStyle)).href],
  };
  // A diagram as the script of Mermaid of VS Code draws it: an SVG element whose style sheet names its ID.
  const diagram = '<pre class="mermaid" id="mermaid-1"><svg id="dmermaid-1"><style>#dmermaid-1 rect { fill: rgb(1, 2, 3); }</style><rect width="40" height="20"></rect></svg></pre>';
  return `<div class="markdown-body">${wrap(`<div class="nimblescape-paper" hidden data-paper="${escapeHtml(JSON.stringify(data))}"></div>\n<div class="nimblescape-paper-text">\n${body.html}${diagram}</div>`)}</div>`;
}

/** page is the stand-in of the Markdown preview of VS Code, with the script and the style of the pages. */
function writePage(): string {
  fs.mkdirSync(path.join(folder, 'markdown-language-features'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'markdown-language-features', 'markdown.css'), 'body { padding: 0 26px; font-size: 14px; }\n');
  // A style sheet of the setting `markdown.styles` of a workspace, which sets the font of every text with !important.
  fs.writeFileSync(path.join(folder, 'user.css'), 'body, p, h1 { font-family: Georgia, serif !important; letter-spacing: 0.04em; }\n');
  // The rules of the style sheets of "Markdown Preview Github Styling" for its elements around the whole HTML
  // (githubWrapper): the space around the text, the font, and the line below a heading.
  fs.mkdirSync(path.join(folder, 'bierner.markdown-preview-github-styles', 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'bierner.markdown-preview-github-styles', 'dist', 'base.css'),
    '.github-markdown-content { padding: 32px !important; max-width: 980px; margin: 0 auto; }\n.github-markdown-body { font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; }\n.github-markdown-body h1 { padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }\n',
  );
  // A style sheet of another extension that sets the color of every paragraph, and the one of Markdown Notes.
  fs.mkdirSync(path.join(folder, 'test.other-extension'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'test.other-extension', 'preview.css'), 'p { color: rgb(200, 0, 0) !important; }\n');
  fs.mkdirSync(path.dirname(path.join(folder, notesStyle)), { recursive: true });
  fs.writeFileSync(path.join(folder, notesStyle), '.test-notes-mark { color: rgb(4, 5, 6); }\n');
  fs.copyFileSync(path.join(repository, 'media', 'paperPreview.js'), path.join(folder, 'paperPreview.js'));
  fs.copyFileSync(path.join(repository, 'media', 'paperPreview.css'), path.join(folder, 'paperPreview.css'));
  fs.writeFileSync(path.join(folder, 'paperLayout.js'), layoutScript);
  fs.copyFileSync(path.join(repository, 'media', 'paperDrawings.js'), path.join(folder, 'paperDrawings.js'));
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
<link rel="stylesheet" class="code-user-style" data-source="user.css" href="user.css" type="text/css" media="screen">
<link rel="stylesheet" href="bierner.markdown-preview-github-styles/dist/base.css">
<link rel="stylesheet" href="test.other-extension/preview.css">
<link rel="stylesheet" href="${notesStyle}">
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
window.zoomed = [];
window.addEventListener('nimblescape-paper-zoomed', (event) => window.zoomed.push(event.detail.zoom));
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

describe('the script of the pages in the Markdown preview (R-PRV-001 to R-PRV-007)', () => {
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
        font: string;
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
            vscodeSheets: [document.getElementById('_defaultStyles').sheet.disabled, document.querySelector('link[href*="markdown-language-features"]').disabled, document.querySelector('link.code-user-style').disabled],
            font: getComputedStyle(pages.querySelector('p')).fontFamily,
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
      expect(state.vscodeSheets).toEqual([true, true, true]);
      // The text has the font of the layout, as in the PDF, not the font of the setting markdown.styles.
      expect(state.font).not.toContain('Georgia');
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
          vscodeSheets: [document.getElementById('_defaultStyles').sheet.disabled, document.querySelector('link[href*="markdown-language-features"]').disabled, document.querySelector('link.code-user-style').disabled],
        })`,
      );
      expect(notes).toEqual({ pages: 0, dark: true, vscodeSheets: [false, false, false] });
    } finally {
      await running.close();
    }
  });

  it.skipIf(!browser)('leaves out of the pages the elements that the plugin of another extension puts around the whole content, with their space and their font (R-PRV-005)', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${paragraph}\n`;
    const paper = await paperContent(text, githubWrapper);
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
      await evaluate(session, `window.show(${JSON.stringify(paper)})`);
      await evaluate(session, waitFor('window.rendered.length > 0'));
      const state = await evaluate<{ wrappers: number; hidden: number; heading: string; left: number; right: number; line: string; font: string; diagram: number }>(
        session,
        `(() => {
          const pages = document.querySelector('.nimblescape-paper-pages');
          pages.style.zoom = '1';
          const area = pages.querySelector('.pagedjs_page_content').getBoundingClientRect();
          const text = pages.querySelector('p').getBoundingClientRect();
          return {
            wrappers: pages.querySelectorAll('.github-markdown-body, .github-markdown-content').length,
            hidden: pages.querySelectorAll('.nimblescape-paper').length,
            heading: pages.querySelector('h1').textContent,
            left: Math.round(text.left - area.left),
            right: Math.round(area.right - text.right),
            line: getComputedStyle(pages.querySelector('h1')).borderBottomStyle,
            font: getComputedStyle(pages.querySelector('p')).fontFamily,
            diagram: pages.querySelectorAll('svg[id="nimblescape-paper-dmermaid-1"]').length,
          };
        })()`,
      );
      // The text starts at the margin of the page, as in the PDF, without the space, the font and the heading of GitHub.
      expect(state).toEqual({ wrappers: 0, hidden: 0, heading: expect.stringContaining('Einleitung'), left: 0, right: 0, line: 'none', font: expect.not.stringContaining('system-ui'), diagram: 1 });
    } finally {
      await running.close();
    }
  });

  it.skipIf(!browser)('gives the pages only the style sheets of the page of the PDF: the style sheets of other extensions in the preview are off, those of Paper and Markdown Notes stay, and each block with a line gets the class of the lines of VS Code (R-PRV-005)', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${paragraph}\n\nDer Befehl \`mp build\`.\n`;
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
      await evaluate(session, `window.show(${JSON.stringify(paper)})`);
      await evaluate(session, waitFor('window.rendered.length > 0'));
      const sheets = `({
        github: document.querySelector('link[href*="bierner"]').disabled,
        other: document.querySelector('link[href*="other-extension"]').disabled,
        notes: document.querySelector('link[href*="markdownnotes"]').disabled,
        paper: document.querySelector('link[href="paperPreview.css"]').disabled,
      })`;
      const state = await evaluate<{ sheets: Record<string, boolean>; color: string; code: string; lines: number; classes: number; hidden: number }>(
        session,
        `(() => {
          const pages = document.querySelector('.nimblescape-paper-pages');
          const lines = [...pages.querySelectorAll('[data-line]')];
          return {
            sheets: ${sheets},
            color: getComputedStyle(pages.querySelector('p')).color,
            code: getComputedStyle(pages.querySelector('code')).color,
            lines: lines.length,
            classes: lines.filter((block) => block.classList.contains('code-line')).length,
            hidden: document.querySelectorAll('.markdown-body .code-line').length,
          };
        })()`,
      );
      // The paragraphs do not get the color of the other extension, and the inline code gets the color of the style
      // sheet of an extension in the page of the PDF.
      expect(state.sheets).toEqual({ github: true, other: true, notes: false, paper: false });
      expect(state.color).not.toBe('rgb(200, 0, 0)');
      expect(state.code).toBe('rgb(1, 2, 3)');
      expect(state.lines).toBeGreaterThan(1);
      expect(state.classes).toBe(state.lines);
      expect(state.hidden).toBe(0);

      // A notes document gets the style sheets of the other extensions back.
      await evaluate(
        session,
        `window.postMessage({ type: 'updateContent', source: 'file:///notes.md', content: '<!DOCTYPE html><html><body><div class="markdown-body"><h1 data-line="0" class="code-line">Notizen</h1></div></body></html>' }, '*')`,
      );
      await evaluate(session, waitFor("!document.body.classList.contains('nimblescape-paper-mode')"));
      expect(await evaluate<Record<string, boolean>>(session, sheets)).toEqual({ github: false, other: false, notes: false, paper: false });
    } finally {
      await running.close();
    }
  });

  it.skipIf(!browser)('shows the first pages after VS Code loaded the page again at the place of the pages of before', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${`${paragraph}\n\n`.repeat(30)}`;
    const paper = await paperContent(text);
    const page = writePage();
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      await running.send('Page.enable', {}, sessionId);
      const open = async (navigate: () => Promise<unknown>) => {
        const loaded = running.once('Page.loadEventFired', sessionId);
        await navigate();
        await loaded;
        await evaluate(session, `window.show(${JSON.stringify(paper)})`);
        await evaluate(session, waitFor('window.rendered.length > 0'));
      };
      await open(() => running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId));
      const top = await evaluate<number>(
        session,
        `new Promise((resolve) => { window.scrollTo(0, 1500); setTimeout(() => resolve(window.scrollY), 200); })`,
      );
      expect(top).toBeGreaterThan(1000);

      // VS Code loads the page again, as for "Markdown: Refresh Preview", and scrolls the empty page to its top.
      await open(() => running.send('Page.reload', {}, sessionId));
      const after = await evaluate<{ top: number; pages: number }>(session, `({ top: window.scrollY, pages: document.querySelectorAll('.nimblescape-paper-pages .pagedjs_page').length })`);
      expect(after.pages).toBeGreaterThan(3);
      expect(Math.abs(after.top - top)).toBeLessThanOrEqual(1);

      // Another document in the same page starts at its top.
      await evaluate(session, `sessionStorage.setItem('nimblescape-paper-place', JSON.stringify({ source: 'file:///other.md', top: 900, left: 0 }))`);
      await open(() => running.send('Page.reload', {}, sessionId));
      expect(await evaluate<number>(session, 'window.scrollY')).toBe(0);
    } finally {
      await running.close();
    }
  });

  it.skipIf(!browser)('shows the pages of before without a new layout after VS Code loaded the page again for the same content with another selected note', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${`${paragraph}\n\n`.repeat(12)}`;
    const paper = await paperContent(text);
    // Markdown Notes marks the selected note with attributes of a state, which change nothing on the pages.
    const selected = paper.replace('<h1 ', '<h1 data-selected="true" data-reveal="2" ');
    expect(selected).not.toBe(paper);
    const changed = await paperContent(text.replace('# Einleitung', '# Einführung'));
    const page = writePage();
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      await running.send('Page.enable', {}, sessionId);
      const open = async (navigate: () => Promise<unknown>, content: string) => {
        const loaded = running.once('Page.loadEventFired', sessionId);
        await navigate();
        await loaded;
        await evaluate(session, `window.show(${JSON.stringify(content)})`);
        await evaluate(session, waitFor('window.rendered.length > 0'));
        return evaluate<{ pagedJs: boolean; pages: number; width: number; font: string; heading: string; echo: number; vscodeSheets: boolean[] }>(
          session,
          `(() => {
            const pages = document.querySelector('.nimblescape-paper-pages');
            return {
              pagedJs: typeof window.Paged !== 'undefined',
              pages: pages.querySelectorAll('.pagedjs_page').length,
              width: Math.round(pages.querySelector('.pagedjs_page').getBoundingClientRect().width),
              font: getComputedStyle(pages.querySelector('p')).fontFamily,
              heading: pages.querySelector('h1').textContent,
              echo: window.messages.length,
              vscodeSheets: [document.getElementById('_defaultStyles').sheet.disabled, document.querySelector('link.code-user-style').disabled],
            };
          })()`,
        );
      };
      const first = await open(() => running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId), paper);
      expect(first.pagedJs).toBe(true);
      expect(first.pages).toBeGreaterThan(1);

      // VS Code loads the page again because Markdown Notes selected a note: the pages of before show, without Paged.js.
      const kept = await open(() => running.send('Page.reload', {}, sessionId), selected);
      expect(kept).toEqual({ ...first, pagedJs: false });

      // Another text makes new pages.
      const next = await open(() => running.send('Page.reload', {}, sessionId), changed);
      expect(next.pagedJs).toBe(true);
      expect(next.heading).toContain('Einführung');
    } finally {
      await running.close();
    }
  });
  it.skipIf(!browser)('zooms the pages: Page Width makes a page as wide as the window, Single Page shows a whole page, the menu "Zoom" asks with the content, and the keys and the wheel with Ctrl zoom at a place that stays (R-PRV-007)', { timeout: 120_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${`${paragraph}\n\n`.repeat(30)}`;
    const paper = await paperContent(text);
    // The content after a click in the menu "Zoom": the hidden element holds the number and the action of the request.
    let requests = 0;
    const asked = (action: string, id = `r${++requests}`) => paper.replace('<div class="nimblescape-paper" hidden ', `<div class="nimblescape-paper" hidden data-zoom-request="${id} ${action}" `);
    expect(asked('in')).not.toBe(paper);
    const page = writePage();
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      // A window wider than a page.
      await running.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await running.send('Page.enable', {}, sessionId);
      const open = async (navigate: () => Promise<unknown>, content = paper) => {
        const loaded = running.once('Page.loadEventFired', sessionId);
        await navigate();
        await loaded;
        await evaluate(session, `window.show(${JSON.stringify(content)})`);
        await evaluate(session, waitFor('window.rendered.length > 0'));
        // A stand-in for VS Code, which listens on the window for the keys and the wheel, after the scripts of the page.
        await evaluate(session, `window.vscodeKeys = 0; window.addEventListener('keydown', () => window.vscodeKeys++); window.addEventListener('wheel', () => window.vscodeKeys++); true`);
      };
      // A click in the menu "Zoom": VS Code loads the page again with the request in the content.
      const menu = (action: string) => open(() => running.send('Page.reload', {}, sessionId), asked(action));
      await open(() => running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId));
      type State = { zoom: number; width: number; height: number; count: number; bodyWidth: number; clientWidth: number; clientHeight: number; scrollX: number; scrollY: number; scrollWidth: number; scrollHeight: number; mode: string; label: string; shown: boolean; labels: number; pagedJs: boolean; vscodeKeys: number; zoomed: number[] };
      const state = (): Promise<State> =>
        evaluate<State>(
          session,
          `(() => {
            const pages = document.querySelector('.nimblescape-paper-pages');
            const page = pages.querySelector('.pagedjs_page');
            const zoom = Number.parseFloat(pages.style.zoom) || 1;
            const rect = page.getBoundingClientRect();
            const scale = 'currentCSSZoom' in Element.prototype ? page.currentCSSZoom : 1;
            const view = document.documentElement;
            const label = document.querySelector('.nimblescape-paper-zoom');
            return {
              zoom,
              width: rect.width / scale,
              height: rect.height / scale,
              count: pages.querySelectorAll('.pagedjs_page').length,
              bodyWidth: document.body.clientWidth,
              clientWidth: view.clientWidth,
              clientHeight: view.clientHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              scrollWidth: view.scrollWidth,
              scrollHeight: view.scrollHeight,
              mode: (JSON.parse(sessionStorage.getItem('nimblescape-paper-zoom') || 'null') || { mode: 'width' }).mode,
              label: label ? label.textContent : '',
              shown: label ? label.classList.contains('nimblescape-paper-zoom-shown') : false,
              labels: document.querySelectorAll('.nimblescape-paper-zoom').length,
              pagedJs: typeof window.Paged !== 'undefined',
              vscodeKeys: window.vscodeKeys,
              zoomed: window.zoomed,
            };
          })()`,
        );

      // Page Width by default: a page is as wide as the window, with a small space at each side, also larger than the
      // paper. Nothing of the zoom shows on the pages: no bar, and no label before a change of the zoom.
      const width = await state();
      expect(width.mode).toBe('width');
      expect(width.zoom).toBeGreaterThan(1);
      expect(Math.abs(width.zoom * width.width - (width.bodyWidth - 24))).toBeLessThan(1);
      expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
      expect(width.labels).toBe(0);
      expect(await evaluate<number>(session, `document.querySelectorAll('.nimblescape-paper-zoom button, [role="toolbar"]').length`)).toBe(0);

      // Single Page of the menu: VS Code loads the page again, the pages of before show without Paged.js, and a whole
      // page and the space above and below it fill the height of the window, and a page starts at the top of the
      // window; the page is not longer than the pages, although the hidden content is longer.
      await evaluate(session, 'window.scrollTo(0, 2500)');
      // The page keeps the place after the event of the scroll, before VS Code loads the page again.
      await evaluate(session, waitFor("window.scrollY > 0 && (JSON.parse(sessionStorage.getItem('nimblescape-paper-place') || 'null') || {}).top === window.scrollY"));
      await menu('page');
      const single = await state();
      expect(single.pagedJs).toBe(false);
      expect(single.mode).toBe('page');
      expect(Math.abs(single.zoom * (single.height + 32) - single.clientHeight)).toBeLessThan(1);
      const index = Math.round(single.scrollY / ((single.height + 16) * single.zoom));
      expect(index).toBeGreaterThan(0);
      expect(Math.abs(single.scrollY - index * (single.height + 16) * single.zoom)).toBeLessThan(1);
      expect(single.scrollHeight).toBeLessThanOrEqual(Math.ceil((single.count * (single.height + 16) + 16) * single.zoom) + 1);
      // The label shows the factor and the mode for a moment, and lets the pointer through to the pages.
      expect(single.label).toBe(`${Math.round(single.zoom * 100)} % · Single Page`);
      expect(single.shown).toBe(true);
      expect(await evaluate<string>(session, `getComputedStyle(document.querySelector('.nimblescape-paper-zoom')).pointerEvents`)).toBe('none');
      await evaluate(session, waitFor("!document.querySelector('.nimblescape-paper-zoom').classList.contains('nimblescape-paper-zoom-shown')"));

      // Zoom In of the menu goes to the next step and keeps the place in the middle of the window.
      const before = await state();
      const middleY = (before.scrollY + before.clientHeight / 2) / before.zoom;
      await menu('in');
      const larger = await state();
      expect(larger.mode).toBe('fixed');
      expect(larger.zoom).toBeGreaterThan(before.zoom);
      expect([0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1]).toContain(larger.zoom);
      expect(Math.abs((larger.scrollY + larger.clientHeight / 2) / larger.zoom - middleY)).toBeLessThan(2);
      expect(larger.label).toBe(`${Math.round(larger.zoom * 100)} %`);
      expect(larger.zoomed.length).toBeGreaterThan(0);

      // A request counts once: a new content with the same request, while the user types, and a load of the page again
      // with it, do not zoom again.
      const id = `r${requests}`;
      await evaluate(session, `window.postMessage({ type: 'updateContent', source: 'file:///paper.md', content: ${JSON.stringify(`<!DOCTYPE html><html><body>${asked('in', id)}</body></html>`)} }, '*')`);
      await evaluate(session, waitFor('window.rendered.length > 1'));
      expect((await state()).zoom).toBe(larger.zoom);
      await open(() => running.send('Page.reload', {}, sessionId), asked('in', id));
      expect((await state()).zoom).toBe(larger.zoom);

      // Ctrl and + or - zoom, and VS Code does not get these keys, which would zoom the whole window; Ctrl+0 gives Page Width.
      await evaluate(session, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '=', code: 'Equal', ctrlKey: true, bubbles: true, cancelable: true }))`);
      const key = await state();
      expect(key.zoom).toBeGreaterThan(larger.zoom);
      expect(key.shown).toBe(true);
      await evaluate(session, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Minus', ctrlKey: true, bubbles: true, cancelable: true }))`);
      expect((await state()).zoom).toBe(larger.zoom);
      await evaluate(session, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', ctrlKey: true, bubbles: true, cancelable: true }))`);
      const reset = await state();
      expect(reset.mode).toBe('width');
      expect(reset.zoom).toBeCloseTo(width.zoom, 3);
      expect(reset.vscodeKeys).toBe(0);
      // A key without Ctrl goes to VS Code.
      await evaluate(session, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '=', code: 'Equal', bubbles: true, cancelable: true }))`);
      expect((await state()).vscodeKeys).toBe(1);

      // Actual Size of the menu shows the pages in the size of the paper; Zoom In five times gives 200 %.
      await menu('actual');
      const actual = await state();
      expect(actual.zoom).toBe(1);
      expect(actual.label).toBe('100 %');
      for (let turn = 0; turn < 5; turn++) {
        await menu('in');
      }
      const wide = await state();
      expect(wide.zoom).toBe(2);
      expect(wide.scrollWidth).toBeGreaterThan(wide.clientWidth);

      // The wheel with Ctrl zooms at the pointer: the place on the pages under the pointer stays under it, also to the
      // side when the pages are wider than the window, which then scrolls to the side.
      await evaluate(session, `window.scrollTo(200, window.scrollY)`);
      const pointer = { x: 700, y: 400 };
      const placeOf = (s: State) => ({
        x: (s.scrollX + pointer.x - Math.max(0, (s.bodyWidth - s.zoom * s.width) / 2)) / s.zoom,
        y: (s.scrollY + pointer.y) / s.zoom,
      });
      const under = placeOf(await state());
      for (let turn = 0; turn < 3; turn++) {
        await evaluate(session, `document.querySelector('.nimblescape-paper-pages p').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: ${pointer.x}, clientY: ${pointer.y}, ctrlKey: true, bubbles: true, cancelable: true }))`);
      }
      const wheel = await state();
      expect(wheel.zoom).toBeCloseTo(2 * Math.exp(0.6), 2);
      expect(Math.abs(placeOf(wheel).x - under.x)).toBeLessThan(2);
      expect(Math.abs(placeOf(wheel).y - under.y)).toBeLessThan(2);
      expect(wheel.vscodeKeys).toBe(0);

      // The zoom stays when VS Code loads the page again, as for a note that Markdown Notes selects.
      await open(() => running.send('Page.reload', {}, sessionId));
      const again = await state();
      expect(again.zoom).toBeCloseTo(wheel.zoom, 3);
      expect(again.mode).toBe('fixed');
      expect(again.labels).toBe(0);

      // Page Width of the menu.
      await menu('width');
      const back = await state();
      expect(back.mode).toBe('width');
      expect(back.zoom).toBeCloseTo(width.zoom, 3);
      expect(back.label).toBe(`${Math.round(back.zoom * 100)} % · Page Width`);

      // Single Page stays after a change of the size of the window, and fits the new window.
      await menu('page');
      await running.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(session, `new Promise((resolve) => setTimeout(() => resolve(true), 400))`);
      const narrow = await state();
      expect(narrow.mode).toBe('page');
      expect(narrow.zoom * narrow.width).toBeLessThanOrEqual(narrow.bodyWidth - 24 + 1);
      expect(narrow.zoom * (narrow.height + 32)).toBeLessThanOrEqual(narrow.clientHeight + 1);

      // A notes document has no label of the zoom.
      await evaluate(
        session,
        `window.postMessage({ type: 'updateContent', source: 'file:///notes.md', content: '<!DOCTYPE html><html><body><div class="markdown-body"><h1 data-line="0" class="code-line">Notizen</h1></div></body></html>' }, '*')`,
      );
      await evaluate(session, waitFor("!document.body.classList.contains('nimblescape-paper-mode')"));
      expect(await evaluate<number>(session, `document.querySelectorAll('.nimblescape-paper-zoom').length`)).toBe(0);
    } finally {
      await running.close();
    }
  });

  it.skipIf(!browser)('a new preview does not do the request of the zoom of its first content, which was meant for an older preview (R-PRV-007)', { timeout: 90_000 }, async () => {
    const paragraph = 'Ein Absatz über die Arbeit von Teams mit Agenten. '.repeat(12);
    const text = `---\nlayout: plain\ntitle: Agenten\nauthor: Hannes\n---\n\n# Einleitung\n\n${`${paragraph}\n\n`.repeat(10)}`;
    const paper = (await paperContent(text)).replace('<div class="nimblescape-paper" hidden ', '<div class="nimblescape-paper" hidden data-zoom-request="old page" ');
    const page = writePage();
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      await running.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await running.send('Page.enable', {}, sessionId);
      const loaded = running.once('Page.loadEventFired', sessionId);
      await running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);
      await loaded;
      await evaluate(session, `window.show(${JSON.stringify(paper)})`);
      await evaluate(session, waitFor('window.rendered.length > 0'));
      expect(await evaluate<string | null>(session, `sessionStorage.getItem('nimblescape-paper-zoom')`)).toBeNull();
      expect(await evaluate<number>(session, `document.querySelectorAll('.nimblescape-paper-zoom').length`)).toBe(0);
      // The same request after a load of the page again is done already.
      const again = running.once('Page.loadEventFired', sessionId);
      await running.send('Page.reload', {}, sessionId);
      await again;
      await evaluate(session, `window.show(${JSON.stringify(paper)})`);
      await evaluate(session, waitFor('window.rendered.length > 0'));
      expect(await evaluate<string | null>(session, `sessionStorage.getItem('nimblescape-paper-zoom')`)).toBeNull();
    } finally {
      await running.close();
    }
  });
});
