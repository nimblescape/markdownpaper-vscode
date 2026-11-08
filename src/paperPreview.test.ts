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
});
