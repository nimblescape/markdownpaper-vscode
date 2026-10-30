// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The script of the pages in the Markdown preview of VS Code (docs/requirements.md, R-PRV-001 to R-PRV-006). VS Code
// runs it in the preview of every Markdown file. For a paper document, the markdown-it plugin of the extension puts a
// hidden element `.nimblescape-paper` with the layout into the content `.markdown-body` (src/markdownPreview.ts), or
// one that says that the extension still reads the layout, and then the script shows only a note. The script then:
//
// 1. lets the content of the preview stay in the page, hidden and off screen, so that VS Code keeps changing it and
//    the scripts of other extensions keep drawing in it, for example the diagrams of Mermaid;
// 2. waits until these scripts are done, and lets Paged.js make the pages from a copy of the content, with the style
//    sheets and the templates of the layout, in a hidden area before the content;
// 3. shows the new pages in place of the old ones, so the pages do not flicker, and keeps the place on the page; the
//    pages get smaller when the preview is narrower than a page;
// 4. lets VS Code read the lines of the blocks again, now on the pages, so that the double click to the line and the
//    scrolling with the text editor work: VS Code keeps the blocks of a version of the content, and the script sends
//    the last content of VS Code once more, which counts as a new version and changes nothing on the pages;
// 5. sends the event `nimblescape-paper-rendered` to `window`, so that the scripts of other extensions, such as the one
//    of Markdown Notes, can mark the pages.
//
// While a paper document shows, the style sheets of the Markdown preview of VS Code and of the theme do not apply,
// and the body has the classes of a light theme, since the pages are white paper; paperPreview.css gives the colors of
// the theme the values of a light theme, which scripts such as the one of Mermaid read. A notes document keeps the
// preview as VS Code shows it.
(function () {
  'use strict';
  const script = document.currentScript;
  const nonce = script ? script.nonce || script.getAttribute('nonce') || '' : '';
  const base = script ? script.src : location.href;

  /** The source of the preview, as VS Code sends it with each content; the script sends it back with its own copy. */
  let source = readSource();
  /** The last content that VS Code sent, which the script sends once more. */
  let original = readInitialContent();
  /** True while the copy of the content that the script sent itself is on its way. */
  let echo = false;
  let timer;
  let running = false;
  let again = false;
  /** True when the pages of the content were made once more because a script had not drawn everything. */
  let retried = false;
  let previewer;
  /** The previewer of Paged.js that makes the next pages, whose style sheets stay on. */
  let building;
  let pagedJs;
  /** The style sheets of VS Code that the script switched off for a paper document. */
  const switchedOff = new Set();
  let headWatch;
  let themeWatch;

  function readSource() {
    const element = document.getElementById('vscode-markdown-preview-data');
    try {
      return JSON.parse((element && element.getAttribute('data-settings')) || '{}').source;
    } catch {
      return undefined;
    }
  }

  function readInitialContent() {
    const element = document.getElementById('vscode-markdown-preview-data');
    const initial = element && element.getAttribute('data-initial-md-content');
    return initial ? `<!DOCTYPE html><html><body>${initial}</body></html>` : undefined;
  }

  function content() {
    return document.querySelector('.markdown-body');
  }

  function paperData() {
    const element = document.querySelector('.markdown-body .nimblescape-paper');
    if (!element) {
      return undefined;
    }
    try {
      return JSON.parse(element.getAttribute('data-paper') || '');
    } catch {
      return undefined;
    }
  }

  function loadScript(file, what) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = new URL(file, base).href;
      element.setAttribute('nonce', nonce);
      element.onload = () => resolve();
      element.onerror = () => reject(new Error(`${what} did not load.`));
      document.head.appendChild(element);
    });
  }

  // Paged.js, and the handler of the last lines of justified paragraphs (paperLastLine.js, R-REN-012).
  function loadPagedJs() {
    if (window.Paged && window.paperLastLines) {
      return Promise.resolve();
    }
    if (!pagedJs) {
      pagedJs = Promise.all([loadScript('paged.js', 'Paged.js'), loadScript('paperLastLine.js', 'The script of the last lines')]).then(() => {
        window.paperLastLines.register();
      });
    }
    return pagedJs;
  }

  // The style sheets of VS Code: those of its Markdown extension, and the inline styles of the theme and of the
  // settings of the preview. The style sheets of other extensions, such as KaTeX or Markdown Notes, stay.
  function styleSheetsOfVsCode() {
    const sheets = [];
    for (const element of Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))) {
      if (element.hasAttribute('data-nimblescape-paper') || [previewer, building].some((own) => own && own.polisher && (own.polisher.styleEl === element || (own.polisher.inserted || []).includes(element)))) {
        continue;
      }
      if (element.tagName === 'LINK' ? /\/markdown-language-features\//.test(element.href || '') : !element.hasAttribute('data-pagedjs-inserted-styles')) {
        sheets.push(element);
      }
    }
    return sheets;
  }

  /** The classes of the theme that the script took from the body, which it gives back for a notes document. */
  let themeClasses;

  function lightTheme() {
    const classes = document.body.classList;
    const theme = ['vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light'].filter((name) => classes.contains(name));
    if (theme.length > 0) {
      themeClasses = theme;
      classes.remove(...theme);
      classes.add('vscode-light');
    }
  }

  function enterPaperMode() {
    if (!document.body.classList.contains('nimblescape-paper-mode')) {
      document.body.classList.add('nimblescape-paper-mode');
      themeWatch = new MutationObserver(lightTheme);
      themeWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      headWatch = new MutationObserver(switchOffStyleSheets);
      headWatch.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    lightTheme();
    switchOffStyleSheets();
  }

  function switchOffStyleSheets() {
    for (const element of styleSheetsOfVsCode()) {
      if (!element.disabled || element.sheet?.disabled === false) {
        element.disabled = true;
        if (element.sheet) {
          element.sheet.disabled = true;
        }
      }
      switchedOff.add(element);
    }
  }

  function leavePaperMode() {
    if (!document.body.classList.contains('nimblescape-paper-mode')) {
      return;
    }
    document.body.classList.remove('nimblescape-paper-mode');
    headWatch?.disconnect();
    themeWatch?.disconnect();
    indicator(false);
    if (themeClasses) {
      document.body.classList.remove('vscode-light');
      document.body.classList.add(...themeClasses);
      themeClasses = undefined;
    }
    for (const element of switchedOff) {
      element.disabled = false;
      if (element.sheet) {
        element.sheet.disabled = false;
      }
    }
    switchedOff.clear();
    for (const area of Array.from(document.querySelectorAll('.nimblescape-paper-pages, .nimblescape-paper-next'))) {
      area.remove();
    }
    removeStylesOf(previewer);
    previewer = undefined;
    setBodyAttributes({});
  }

  function removeStylesOf(old) {
    if (!old || !old.polisher) {
      return;
    }
    for (const style of old.polisher.inserted || []) {
      style.remove();
    }
    if (old.polisher.styleEl) {
      old.polisher.styleEl.remove();
    }
  }

  function setBodyAttributes(attributes) {
    for (const attribute of Array.from(document.body.attributes)) {
      if (attribute.name === 'data-layout' || attribute.name.startsWith('data-field-')) {
        document.body.removeAttribute(attribute.name);
      }
    }
    for (const [name, value] of Object.entries(attributes)) {
      document.body.setAttribute(name, value);
    }
  }

  // pending matches the content that a script of another extension has still to draw: a diagram of Mermaid without
  // its SVG element, whose script loads its parts the first time.
  const pending = '.mermaid:not(:has(svg))';

  // settle waits until the scripts of other extensions stop changing the content: a short time without a change and
  // nothing left to draw, at most a few seconds.
  function settle(root) {
    return new Promise((resolve) => {
      const start = Date.now();
      let wait;
      const observer = new MutationObserver(() => later(200));
      function done() {
        if (root.querySelector(pending) && Date.now() - start < 5000) {
          later(200);
          return;
        }
        observer.disconnect();
        clearTimeout(wait);
        resolve();
      }
      function later(time) {
        clearTimeout(wait);
        wait = setTimeout(done, Date.now() - start > 5000 ? 0 : time);
      }
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      later(150);
    });
  }

  function indicator(on) {
    let element = document.querySelector('.nimblescape-paper-busy');
    if (on && !element) {
      element = document.createElement('div');
      element.className = 'nimblescape-paper-busy';
      element.textContent = 'Making the pages …';
      document.body.appendChild(element);
    } else if (!on && element) {
      element.remove();
    }
  }

  // keepFromScripts keeps the drawings on the pages away from the scripts that drew them in the content. The script of
  // Mermaid of VS Code draws each element `.mermaid` of the page again after each update, and finds the drawing by the
  // ID of its SVG element, the first one in the page: the one on the pages, which stand first. On the pages, these
  // elements get another class, and each SVG element another ID, also in its own style sheet.
  function keepFromScripts(root) {
    for (const element of Array.from(root.querySelectorAll('.mermaid'))) {
      element.classList.replace('mermaid', 'nimblescape-paper-mermaid');
      if (element.id) {
        element.id = `nimblescape-paper-${element.id}`;
      }
    }
    for (const svg of Array.from(root.querySelectorAll('svg[id]'))) {
      const old = svg.id;
      const id = `nimblescape-paper-${old}`;
      const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const selector = new RegExp(`#${escaped}(?![\\w-])`, 'g');
      svg.id = id;
      for (const style of Array.from(svg.querySelectorAll('style'))) {
        style.textContent = (style.textContent || '').replace(selector, `#${id}`);
      }
    }
  }

  async function makePages() {
    const paper = paperData();
    const body = content();
    if (!paper || !body) {
      leavePaperMode();
      return;
    }
    enterPaperMode();
    indicator(true);
    if (paper.pending) {
      // The extension still reads the layout, and then renders the preview again.
      return;
    }
    await loadPagedJs();
    await settle(body);
    // A script that draws only after an update, such as the one of Mermaid for the first content, draws after the
    // update that the script sends below; then the script makes the pages once more.
    const unfinished = Boolean(body.querySelector(pending));
    if (!paperData()) {
      leavePaperMode();
      return;
    }
    if (paperData().pending) {
      return;
    }
    setBodyAttributes(Object.assign({ 'data-layout': paper.layout }, paper.attributes || {}));
    document.documentElement.lang = paper.language || document.documentElement.lang;
    const blocks = Array.from(body.children)
      .filter((element) => !element.classList.contains('nimblescape-paper'))
      .map((element) => element.outerHTML)
      .join('\n');
    const template = document.createElement('template');
    template.innerHTML = `${paper.before || ''}\n<main class="paper-text">\n${blocks}\n</main>\n${paper.after || ''}`;
    // The text has the fields as attributes too, for the rules of breaks and named pages, which Paged.js applies to
    // the content without its body.
    const text = template.content.querySelector('main.paper-text');
    for (const [name, value] of Object.entries(paper.attributes || {})) {
      text.setAttribute(name, value);
    }
    keepFromScripts(template.content);
    const old = document.querySelector('.nimblescape-paper-pages');
    const area = document.createElement('div');
    area.className = 'nimblescape-paper-next';
    body.before(area);
    const scroll = window.scrollY;
    const next = new window.Paged.Previewer();
    building = next;
    const styles = (paper.styles || []).map((css, index) => ({ [`${location.href.split('#')[0]}#nimblescape-paper-${index}`]: css }));
    try {
      await next.preview(template.content, styles, area);
    } catch (error) {
      area.remove();
      removeStylesOf(next);
      throw error;
    } finally {
      building = undefined;
    }
    // The pages stay as they are: Paged.js would lay out a page again when its size changes, which the smaller pages
    // of a narrow preview do, again and again.
    for (const page of (next.chunker && next.chunker.pages) || []) {
      page.removeListeners();
    }
    if (old) {
      old.remove();
    }
    removeStylesOf(previewer);
    previewer = next;
    area.className = 'nimblescape-paper-pages';
    fit();
    window.scrollTo(0, scroll);
    indicator(false);
    // VS Code reads the lines of the blocks again, now on the pages.
    echo = true;
    const current = content();
    window.postMessage({ type: 'updateContent', source, content: original || `<!DOCTYPE html><html><body>${current ? current.outerHTML : ''}</body></html>` }, '*');
    window.dispatchEvent(new CustomEvent('nimblescape-paper-rendered', { detail: { pages: area.querySelectorAll('.pagedjs_page').length } }));
    if (unfinished && !retried) {
      retried = true;
      schedule(typeof paper.delay === 'number' ? paper.delay : 800);
    }
  }

  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await makePages();
      } while (again);
    } catch (error) {
      indicator(false);
      console.error('nimblescape Markdown Paper:', error);
    } finally {
      running = false;
    }
  }

  // fit makes the pages as small as the width of the preview needs, never larger than their size.
  function fit() {
    const pages = document.querySelector('.nimblescape-paper-pages');
    const page = pages && pages.querySelector('.pagedjs_page');
    if (!page) {
      return;
    }
    const zoom = Number.parseFloat(pages.style.zoom || '1') || 1;
    const width = page.getBoundingClientRect().width / zoom;
    pages.style.zoom = String(Math.min(1, Math.max(0.25, (document.documentElement.clientWidth - 24) / width)));
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 100);
  });

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  // The messages of VS Code tell the source of a new content.
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'updateContent' && typeof message.source === 'string' && event.source !== window) {
      source = message.source;
      original = typeof message.content === 'string' ? message.content : undefined;
    }
  });

  window.addEventListener('vscode.markdown.updateContent', () => {
    if (echo) {
      echo = false;
      return;
    }
    retried = false;
    const paper = paperData();
    if (!paper) {
      clearTimeout(timer);
      leavePaperMode();
      return;
    }
    // At once, before the scripts of other extensions draw, so that they draw for white paper.
    enterPaperMode();
    schedule(typeof paper.delay === 'number' ? paper.delay : 800);
  });

  // A link to a place in the document goes to that place on the pages, not to the hidden content.
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target && target.closest('a[href^="#"]');
      const pages = document.querySelector('.nimblescape-paper-pages');
      if (!link || !pages || !pages.contains(link)) {
        return;
      }
      let id = link.getAttribute('href').slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // A link with a wrong escape keeps its text.
      }
      const place = pages.querySelector(`[id="${CSS.escape(id)}"]`);
      if (place) {
        event.preventDefault();
        event.stopPropagation();
        place.scrollIntoView();
      }
    },
    true,
  );

  // VS Code puts the first content into the page after this script ran, and sends no event for it.
  function start() {
    if (!content()) {
      return false;
    }
    if (paperData()) {
      enterPaperMode();
      schedule(0);
    }
    return true;
  }
  if (!start()) {
    const watch = new MutationObserver(() => {
      if (start()) {
        watch.disconnect();
      }
    });
    watch.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
