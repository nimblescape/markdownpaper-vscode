// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The script of the pages in the Markdown preview of VS Code (docs/requirements.md, R-PRV-001 to R-PRV-007). VS Code
// runs it in the preview of every Markdown file. For a paper document, the markdown-it plugin of the extension puts a
// hidden element `.nimblescape-paper` with the layout and the style sheets of the page of the PDF into the content
// `.markdown-body`, then the element `.nimblescape-paper-text` with the text of the renderer of the PDF
// (src/markdownPreview.ts); or a hidden element that says that the extension still reads the layout, and then the
// script shows only a note. The script then:
//
// 1. lets the content of the preview stay in the page, hidden and off screen, so that VS Code keeps changing it and
//    the scripts of other extensions keep drawing in it, for example the diagrams of Mermaid; without nimblescape
//    PlantUML, the script of the PlantUML diagrams of the PDF draws them;
// 2. waits until these scripts are done, and lets Paged.js make the pages from a copy of the blocks of the text of
//    `.nimblescape-paper-text` (textOf), also when the plugin of another extension puts elements around the whole
//    content, with the style sheets of the page of the PDF and the templates of the layout, in a hidden area before
//    the content; in the copy, each PlantUML block gets copies of the diagrams that its script drew into its shadow
//    root (paperDrawings.js), and each block with a line gets the class of the lines of VS Code (`code-line`);
// 3. shows the new pages in place of the old ones, so the pages do not flicker, and keeps the place on the page; the
//    pages have the zoom of the bar of the zoom, by default as wide as the window (R-PRV-007). VS Code loads the page
//    of the preview again for "Markdown: Refresh Preview", and so also each time Markdown Notes selects a note; it
//    then puts the empty page at the top, before the pages exist. The script keeps the place of the pages of its source in the storage of the
//    page, which stays over such a load, and the first pages after a load show at that place. It also keeps the last
//    pages there with the key of their content; when only the attributes of a state changed, such as the selected note
//    of Markdown Notes, the pages of before show again at once, without Paged.js;
// 4. lets VS Code read the lines of the blocks again, now on the pages, so that the double click to the line and the
//    scrolling with the text editor work: VS Code keeps the blocks of a version of the content, and the script sends
//    the last content of VS Code once more, which counts as a new version and changes nothing on the pages;
// 5. sends the event `nimblescape-paper-rendered` to `window`, so that the scripts of other extensions, such as the one
//    of Markdown Notes, can mark the pages, and the event `nimblescape-paper-zoomed` after each change of the zoom.
//
// While a paper document shows, only the style sheets of the page of the PDF apply to the pages: the style sheets of the
// Markdown preview of VS Code, of the setting `markdown.styles`, of the theme and of other extensions are off, except
// those of Paper and of Markdown Notes, which paints the highlights of the notes (data `keep`). The body has the
// classes of a light theme, since the pages are white paper; paperPreview.css gives the colors of the theme the values
// of a light theme, which scripts such as the one of Mermaid read. A notes document keeps the preview as VS Code shows
// it.
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
  /** The key of the place of the pages in the storage of the page (sessionStorage), which stays when VS Code loads the page again. */
  const placeKey = 'nimblescape-paper-place';
  /** The place of the pages of the source before VS Code loaded the page, which the first pages take; then undefined. */
  let restore = readPlace();
  /** The key of the last pages in the storage of the page, with their source, the key of their content and their styles. */
  const pagesKey = 'nimblescape-paper-pages';
  /**
   * The attributes that mark a state for the scripts of other extensions, not the content: those of the selected note of
   * Markdown Notes (its request to scroll, its link that deselects it) and of its hidden highlights. Only they change
   * when Markdown Notes selects another note, and they do not change the pages.
   */
  const stateAttributes = /\sdata-(?:selected|reveal|deselect|hidden)="[^"]*"/g;
  /** The key of the last content of VS Code (keyOf), taken when it arrives, before other scripts draw into it. */
  let contentKey;
  /** The style elements of the pages that the script took from the storage of the page, without Paged.js. */
  let keptStyles = [];
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

  // readPlace returns the place of the pages of the source that the page kept before VS Code loaded it again, or
  // undefined.
  function readPlace() {
    try {
      const place = JSON.parse(sessionStorage.getItem(placeKey) || 'null');
      return place && place.source === source && typeof place.top === 'number' ? place : undefined;
    } catch {
      return undefined;
    }
  }

  // keepPlace keeps the place of the pages that show, with their source, in the storage of the page.
  function keepPlace() {
    if (typeof source !== 'string' || !document.body.classList.contains('nimblescape-paper-mode') || !document.querySelector('.nimblescape-paper-pages')) {
      return;
    }
    try {
      sessionStorage.setItem(placeKey, JSON.stringify({ source, top: window.scrollY, left: window.scrollX }));
    } catch {
      // A page without storage starts at the top after a load.
    }
  }

  // keyOf returns the key of a content of VS Code: a hash of the HTML of its `.markdown-body` without the attributes of
  // a state (stateAttributes). VS Code sends the content in two forms, alone and in its whole page; both go through the
  // parser of the browser, so that the same content has the same key.
  function keyOf(html) {
    const body = new DOMParser().parseFromString(html, 'text/html').querySelector('.markdown-body');
    const text = (body ? body.outerHTML : html).replace(stateAttributes, '');
    // cyrb53, a hash of 53 bits.
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${4294967296 * (2097151 & h2) + (h1 >>> 0)}:${text.length}`;
  }

  // keyOfContent returns the key of the content of VS Code that just arrived: of the content that VS Code sent, or else
  // of the content in the page.
  function keyOfContent() {
    const body = content();
    return original ? keyOf(original) : body ? keyOf(body.outerHTML) : undefined;
  }

  // sheetText returns the rules of a style element, also those that Paged.js added to its style sheet.
  function sheetText(style) {
    try {
      return Array.from(style.sheet ? style.sheet.cssRules : [])
        .map((rule) => rule.cssText)
        .join('\n');
    } catch {
      return style.textContent || '';
    }
  }

  // keepPages keeps the pages that show, with the key of their content and their styles, in the storage of the page, so
  // that the page shows them again at once after VS Code loaded it again for the same content (showKeptPages). Pages
  // too large for the storage are not kept.
  function keepPages(area, key) {
    if (typeof source !== 'string' || !key || !previewer || !previewer.polisher) {
      return;
    }
    const polisher = previewer.polisher;
    const styles = [polisher.styleEl, ...(polisher.inserted || [])]
      .filter((style) => style && style.isConnected)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(sheetText);
    try {
      sessionStorage.setItem(pagesKey, JSON.stringify({ source, key, pages: area.outerHTML, styles }));
    } catch {
      try {
        sessionStorage.removeItem(pagesKey);
      } catch {
        // A page without storage makes the pages after each load.
      }
    }
  }

  // afterScrollOfVsCode calls a function after VS Code scrolled the page that it loaded to its place of before: VS Code
  // waits for the images of the content and then scrolls with a timer, so the function waits in the same way, after it.
  function afterScrollOfVsCode(callback) {
    const images = Array.from(document.getElementsByTagName('img'), (image) =>
      image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve);
            image.addEventListener('error', resolve);
          }),
    );
    Promise.all(images).then(() => setTimeout(callback, 0));
  }

  // showKeptPages shows the pages that the storage of the page keeps for the content that VS Code just put into the page,
  // without Paged.js, and tells whether it will: VS Code loads the page again each time Markdown Notes selects a note,
  // and only the attributes of a state change then. The pages show after VS Code scrolled the empty page, so that the
  // scroll of VS Code does not move them; a script that scrolls to a place on them after the event
  // `nimblescape-paper-rendered`, such as the one of Markdown Notes, has the last word.
  function showKeptPages() {
    const paper = paperData();
    const body = content();
    let kept;
    try {
      kept = JSON.parse(sessionStorage.getItem(pagesKey) || 'null');
    } catch {
      kept = undefined;
    }
    if (!paper || paper.pending || !body || !kept || kept.source !== source || !contentKey || kept.key !== contentKey || typeof kept.pages !== 'string' || !Array.isArray(kept.styles)) {
      return false;
    }
    const template = document.createElement('template');
    template.innerHTML = kept.pages;
    const area = template.content.firstElementChild;
    if (!area || !area.classList.contains('nimblescape-paper-pages')) {
      return false;
    }
    afterScrollOfVsCode(() => {
      const now = content();
      if (!now || contentKey !== kept.key || !paperData() || document.querySelector('.nimblescape-paper-pages') || running) {
        // A new content came in the meantime.
        schedule(0);
        return;
      }
      setBodyAttributes(Object.assign({ 'data-layout': paper.layout }, paper.attributes || {}));
      document.documentElement.lang = paper.language || document.documentElement.lang;
      removeKeptStyles();
      keptStyles = kept.styles.map((css) => {
        const style = document.createElement('style');
        style.setAttribute('data-nimblescape-paper', 'pages');
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      });
      now.before(area);
      showPages(area, window.scrollY);
    });
    return true;
  }

  // showPages shows new pages at their place, lets VS Code read the lines of their blocks, and tells the scripts of other
  // extensions that the pages are there.
  function showPages(area, scroll) {
    fit();
    if (restore) {
      // The first pages after VS Code loaded the page again stand where the pages of before stood.
      window.scrollTo(restore.left || 0, restore.top);
      restore = undefined;
    } else {
      window.scrollTo(0, scroll);
    }
    keepPlace();
    indicator(false);
    // VS Code reads the lines of the blocks again, now on the pages.
    echo = true;
    const current = content();
    window.postMessage({ type: 'updateContent', source, content: original || `<!DOCTYPE html><html><body>${current ? current.outerHTML : ''}</body></html>` }, '*');
    window.dispatchEvent(new CustomEvent('nimblescape-paper-rendered', { detail: { pages: area.querySelectorAll('.pagedjs_page').length } }));
  }

  // removeKeptStyles removes the styles of the pages that the script took from the storage of the page.
  function removeKeptStyles() {
    for (const style of keptStyles) {
      style.remove();
    }
    keptStyles = [];
  }

  function readInitialContent() {
    const element = document.getElementById('vscode-markdown-preview-data');
    const initial = element && element.getAttribute('data-initial-md-content');
    return initial ? `<!DOCTYPE html><html><body>${initial}</body></html>` : undefined;
  }

  function content() {
    return document.querySelector('.markdown-body');
  }

  // textOf returns the element of the content whose children are the blocks of the text of a paper document, from the
  // renderer of the PDF (src/markdownPreview.ts). The plugin of another extension can put elements around the whole
  // HTML, for example "Markdown Preview Github Styling" its element `.github-markdown-body`; the pages leave them out,
  // as the PDF does not have them.
  function textOf(body) {
    return body.querySelector('.nimblescape-paper-text') || body;
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

  function loadScript(file, what, module) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = new URL(file, base).href;
      if (module) {
        element.type = 'module';
      }
      element.setAttribute('nonce', nonce);
      element.onload = () => resolve();
      element.onerror = () => reject(new Error(`${what} did not load.`));
      document.head.appendChild(element);
    });
  }

  // Paged.js, the script of the layout of nimblescape Markdown with the handlers of the pages, the page numbers and the
  // last lines of justified paragraphs (paperLayout.js, R-REN-012, R-REN-013), as in the page of the PDF, and the
  // script of the drawings (paperDrawings.js).
  function loadPagedJs() {
    if (window.Paged && window.paperHandlers && window.paperDrawings) {
      return Promise.resolve();
    }
    if (!pagedJs) {
      pagedJs = Promise.all([
        loadScript('paged.js', 'Paged.js'),
        loadScript('paperLayout.js', 'The script of the layout'),
        loadScript('paperDrawings.js', 'The script of the drawings'),
      ]).then(() => {
        window.paperHandlers.register();
      });
    }
    return pagedJs;
  }

  // The script of the PlantUML diagrams of the page of the PDF, from the npm package of nimblescape PlantUML, when the
  // extension is not installed (data `plantUml`): it draws the PlantUML blocks of the text as the extension does.
  let plantUml;
  function loadPlantUml(paper) {
    if (!paper.plantUml) {
      return Promise.resolve();
    }
    if (!plantUml) {
      plantUml = loadScript(paper.plantUml, 'The script of the PlantUML diagrams', true).catch((error) => {
        console.error('nimblescape Markdown Paper:', error);
      });
    }
    return plantUml;
  }

  // The style sheets of the preview that are not in the page of the PDF: those of the Markdown extension of VS Code, of
  // the setting `markdown.styles`, which VS Code adds with the class `code-user-style`, of other extensions, such as
  // KaTeX or "Markdown Preview Github Styling", whose style sheets the pages have as the PDF has them, and the inline
  // styles of the theme and of the settings of the preview. Those of Paper and of Markdown Notes stay (data `keep`), and
  // those of Paged.js.
  function foreignStyleSheets() {
    const paper = paperData();
    // The browser writes an address in its own form, for example with `file+.` where VS Code writes `file%2B.`.
    const keep = ((paper && paper.keep) || []).map((start) => {
      try {
        return new URL(start, location.href).href;
      } catch {
        return start;
      }
    });
    const sheets = [];
    for (const element of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
      if (element.hasAttribute('data-nimblescape-paper') || [previewer, building].some((own) => own && own.polisher && (own.polisher.styleEl === element || (own.polisher.inserted || []).includes(element)))) {
        continue;
      }
      // A style element in the content or in a drawing, such as the one of a diagram of Mermaid, is a part of it.
      if (element.tagName === 'STYLE' && !document.head.contains(element)) {
        continue;
      }
      if (element.tagName === 'LINK' ? !keep.includes(element.href) : !element.hasAttribute('data-pagedjs-inserted-styles')) {
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
    createZoomBar();
  }

  function switchOffStyleSheets() {
    for (const element of foreignStyleSheets()) {
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
    removeZoomBar();
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
    removeKeptStyles();
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

  // settle waits until the scripts of other extensions stop changing the content: a short time without a change and
  // nothing left to draw, at most a few seconds.
  function settle(root) {
    return new Promise((resolve) => {
      const start = Date.now();
      let wait;
      const observer = new MutationObserver(() => later(200));
      function done() {
        // A diagram that a script of another extension has still to draw, such as one of Mermaid, whose script loads
        // its parts the first time, or a PlantUML block of nimblescape PlantUML (paperDrawings.js).
        if (window.paperDrawings.drawingsPending(root) && Date.now() - start < 5000) {
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
    // The key of the content of these pages, before the scripts of other extensions draw into it.
    const key = contentKey;
    await loadPlantUml(paper);
    await loadPagedJs();
    await settle(body);
    // A script that draws only after an update, such as the one of Mermaid for the first content, draws after the
    // update that the script sends below; then the script makes the pages once more.
    const unfinished = window.paperDrawings.drawingsPending(body);
    if (!paperData()) {
      leavePaperMode();
      return;
    }
    if (paperData().pending) {
      return;
    }
    setBodyAttributes(Object.assign({ 'data-layout': paper.layout }, paper.attributes || {}));
    document.documentElement.lang = paper.language || document.documentElement.lang;
    const holder = textOf(body);
    const blocks = Array.from(holder.children)
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
    // VS Code finds the blocks of the lines of the text by their class, for the double click and for the scrolling with
    // the text editor; the renderer of the PDF gives them only their line.
    for (const block of Array.from(text.querySelectorAll('[data-line]'))) {
      block.classList.add('code-line');
    }
    window.paperDrawings.copyPlantUml(holder, template.content);
    keepFromScripts(template.content);
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
    // Also pages from the storage of the page that showed in the meantime.
    for (const element of Array.from(document.querySelectorAll('.nimblescape-paper-pages'))) {
      element.remove();
    }
    removeStylesOf(previewer);
    removeKeptStyles();
    previewer = next;
    area.className = 'nimblescape-paper-pages';
    showPages(area, scroll);
    keepPages(area, key);
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

  // The zoom of the pages (R-PRV-007). The mode "width" (Page Width) makes a page as wide as the window of the preview,
  // the mode "page" (Single Page) shows a whole page in the window, and the mode "fixed" keeps a factor, which "Zoom In",
  // "Zoom Out", "Actual Size" and the wheel with Ctrl or Cmd choose. The pages get the zoom with the CSS property `zoom`
  // on `.nimblescape-paper-pages`; the space around the pages (paperPreview.css) is inside that element, so it zooms too.

  /** The key of the zoom in the storage of the page, which stays when VS Code loads the page again. */
  const zoomKey = 'nimblescape-paper-zoom';
  /** The factors of "Zoom In" and "Zoom Out". */
  const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  /** The smallest and the largest factor of the zoom. */
  const minZoom = 0.1;
  const maxZoom = 5;
  /** The space beside a page in the modes "width" and "page", in pixels of the window. */
  const sideSpace = 12;
  /** The space above, below and between the pages without zoom, in CSS pixels (paperPreview.css). */
  const pageGap = 16;
  /** The zoom of the pages: { mode: 'width' }, { mode: 'page' } or { mode: 'fixed', factor }. */
  let zoom = readZoom();
  /** The bar of the zoom in the window, or undefined outside a paper document. */
  let zoomBar;

  // readZoom returns the zoom that the page kept before VS Code loaded it again, or the mode "width".
  function readZoom() {
    try {
      const kept = JSON.parse(sessionStorage.getItem(zoomKey) || 'null');
      if (kept && (kept.mode === 'width' || kept.mode === 'page')) {
        return { mode: kept.mode };
      }
      if (kept && kept.mode === 'fixed' && typeof kept.factor === 'number' && kept.factor >= minZoom && kept.factor <= maxZoom) {
        return { mode: 'fixed', factor: kept.factor };
      }
    } catch {
      // A page without storage starts with the mode "width".
    }
    return { mode: 'width' };
  }

  function keepZoom() {
    try {
      sessionStorage.setItem(zoomKey, JSON.stringify(zoom));
    } catch {
      // A page without storage starts with the mode "width" after a load.
    }
  }

  function clampZoom(factor) {
    return Math.min(maxZoom, Math.max(minZoom, factor));
  }

  // factorOf returns the zoom that the pages have now.
  function factorOf(pages) {
    const factor = Number.parseFloat(pages.style.zoom);
    return factor > 0 ? factor : 1;
  }

  // pageSize returns the size of the first page without zoom, in CSS pixels. A browser with the standardized zoom
  // (`Element.currentCSSZoom`) gives the rectangle of an element in a zoomed element with the zoom; the browser of VS
  // Code has no standardized zoom and gives it in the coordinates of the zoomed element, so without the zoom.
  function pageSize(pages) {
    const page = pages.querySelector('.pagedjs_page');
    if (!page) {
      return undefined;
    }
    const rect = page.getBoundingClientRect();
    const scale = 'currentCSSZoom' in Element.prototype ? page.currentCSSZoom || 1 : 1;
    return rect.width > 0 && rect.height > 0 ? { width: rect.width / scale, height: rect.height / scale } : undefined;
  }

  // widthOfWindow returns the width of the window for the pages: the width of the body, without the space of the
  // vertical scroll bar (paperPreview.css).
  function widthOfWindow() {
    return document.body.clientWidth || document.documentElement.clientWidth;
  }

  // factorFor returns the zoom of the mode for pages of a size in the window as it is now.
  function factorFor(size) {
    if (zoom.mode === 'fixed') {
      return zoom.factor;
    }
    const byWidth = (widthOfWindow() - 2 * sideSpace) / size.width;
    if (zoom.mode === 'page') {
      return clampZoom(Math.min(byWidth, document.documentElement.clientHeight / (size.height + 2 * pageGap)));
    }
    return clampZoom(byWidth);
  }

  // fit gives the pages the zoom of the mode. With an anchor, a point of the window ({ x, y }), the place of the pages at
  // that point stays there; in the mode "page", the page at that point then fills the window. Without an anchor, the
  // place in pixels stays, as for new pages, which take their place themselves (showPages).
  function fit(anchor) {
    const pages = document.querySelector('.nimblescape-paper-pages');
    const size = pages && pageSize(pages);
    if (!size) {
      updateZoomBar();
      return;
    }
    const old = factorOf(pages);
    const factor = factorFor(size);
    if (Math.abs(factor - old) > 0.0001) {
      const width = widthOfWindow();
      // The place at the anchor on the pages without zoom: the pages start at the top of the page, and stand in the
      // middle of the window while they are narrower than the window, else at its left edge.
      const point = anchor && {
        x: (window.scrollX + anchor.x - Math.max(0, (width - old * size.width) / 2)) / old,
        y: (window.scrollY + anchor.y) / old,
      };
      pages.style.zoom = String(factor);
      if (point) {
        window.scrollTo(Math.max(0, (width - factor * size.width) / 2) + point.x * factor - anchor.x, point.y * factor - anchor.y);
      }
      window.dispatchEvent(new CustomEvent('nimblescape-paper-zoomed', { detail: { zoom: factor } }));
    }
    if (anchor && zoom.mode === 'page') {
      // The page at the anchor fills the window, with the space above and below it.
      const y = (window.scrollY + anchor.y) / factor;
      const count = pages.querySelectorAll('.pagedjs_page').length;
      const index = Math.min(count - 1, Math.max(0, Math.floor((y - pageGap / 2) / (size.height + pageGap))));
      window.scrollTo(window.scrollX, index * (size.height + pageGap) * factor);
    }
    updateZoomBar(factor);
  }

  // middle returns the middle of the window, the anchor of the zoom for the buttons and the keys.
  function middle() {
    return { x: widthOfWindow() / 2, y: document.documentElement.clientHeight / 2 };
  }

  // setZoom sets the zoom of the pages and keeps it in the storage of the page.
  function setZoom(next, anchor) {
    zoom = next.mode === 'fixed' ? { mode: 'fixed', factor: clampZoom(next.factor) } : { mode: next.mode };
    keepZoom();
    fit(anchor || middle());
  }

  // stepZoom zooms in (direction 1) or out (direction -1) to the next factor of zoomSteps.
  function stepZoom(direction) {
    const pages = document.querySelector('.nimblescape-paper-pages');
    if (!pages) {
      return;
    }
    const factor = factorOf(pages);
    const next = direction > 0 ? zoomSteps.find((step) => step > factor * 1.01) : [...zoomSteps].reverse().find((step) => step < factor / 1.01);
    setZoom({ mode: 'fixed', factor: next === undefined ? (direction > 0 ? maxZoom : zoomSteps[0]) : next });
  }

  // createZoomBar puts the bar of the zoom into the window: "Zoom Out", the factor ("Actual Size"), "Zoom In", "Page
  // Width" and "Single Page". The bar stands outside the content of VS Code, so it stays when VS Code changes the content.
  function createZoomBar() {
    if (zoomBar && zoomBar.isConnected) {
      return;
    }
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const key = mac ? '⌘' : 'Ctrl+';
    zoomBar = document.createElement('div');
    zoomBar.className = 'nimblescape-paper-zoom';
    zoomBar.setAttribute('role', 'toolbar');
    zoomBar.setAttribute('aria-label', 'Zoom of the pages');
    const buttons = [
      ['out', '−', `Zoom Out (${key}-)`],
      ['actual', '100 %', 'Actual Size: the size of the paper'],
      ['in', '+', `Zoom In (${key}+)`],
      ['width', 'Page Width', `Page Width: a page as wide as the window (${key}0)`],
      ['page', 'Single Page', 'Single Page: a whole page in the window'],
    ];
    for (const [action, label, title] of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-zoom', action);
      button.title = title;
      button.setAttribute('aria-label', title);
      button.textContent = label;
      zoomBar.appendChild(button);
    }
    zoomBar.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-zoom]') : null;
      if (!button) {
        return;
      }
      const action = button.getAttribute('data-zoom');
      if (action === 'in' || action === 'out') {
        stepZoom(action === 'in' ? 1 : -1);
      } else if (action === 'actual') {
        setZoom({ mode: 'fixed', factor: 1 });
      } else {
        setZoom({ mode: action });
      }
    });
    // A press on the bar is no press on the pages: no double click to the text editor, no selection of a note. It
    // keeps the selected text and the focus, as a button of a tool bar does, so that "Add Note" of Markdown Notes stays.
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
      zoomBar.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === 'mousedown') {
          event.preventDefault();
        }
      });
    }
    document.body.appendChild(zoomBar);
    updateZoomBar();
  }

  function removeZoomBar() {
    if (zoomBar) {
      zoomBar.remove();
      zoomBar = undefined;
    }
  }

  // updateZoomBar shows the factor and the mode of the zoom on the bar.
  function updateZoomBar(factor) {
    if (!zoomBar) {
      return;
    }
    const actual = zoomBar.querySelector('[data-zoom="actual"]');
    if (actual && typeof factor === 'number') {
      actual.textContent = `${Math.round(factor * 100)} %`;
    }
    for (const mode of ['width', 'page']) {
      const button = zoomBar.querySelector(`[data-zoom="${mode}"]`);
      if (button) {
        button.setAttribute('aria-pressed', String(zoom.mode === mode));
      }
    }
  }

  function paperShows() {
    return document.body.classList.contains('nimblescape-paper-mode') && document.querySelector('.nimblescape-paper-pages') !== null;
  }

  // Ctrl (on macOS Cmd) with + or = zooms in, with - zooms out, with 0 gives the mode "width". The script listens on the
  // window before VS Code, which would otherwise zoom the whole window. On macOS, Ctrl+- is Go Back of VS Code, which
  // goes back after a jump on the pages (R-PRV-004), so only Cmd zooms there.
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  window.addEventListener(
    'keydown',
    (event) => {
      const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!primary || event.altKey || !paperShows()) {
        return;
      }
      const code = event.code;
      let action;
      if (event.key === '+' || event.key === '=' || code === 'NumpadAdd') {
        action = () => stepZoom(1);
      } else if (event.key === '-' || code === 'NumpadSubtract') {
        action = () => stepZoom(-1);
      } else if (event.key === '0' || code === 'Numpad0') {
        action = () => setZoom({ mode: 'width' });
      }
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        action();
      }
    },
    true,
  );

  // The wheel with Ctrl or Cmd, and the pinch on a touchpad, which the browser sends as such a wheel, zoom at the
  // pointer.
  window.addEventListener(
    'wheel',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || !paperShows()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const pages = document.querySelector('.nimblescape-paper-pages');
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? document.documentElement.clientHeight : 1);
      setZoom({ mode: 'fixed', factor: factorOf(pages) * Math.exp(-pixels / 500) }, { x: event.clientX, y: event.clientY });
    },
    { capture: true, passive: false },
  );

  window.addEventListener('scroll', keepPlace, { passive: true });

  // After a change of the size of the window, the modes "width" and "page" zoom again; the place at the top of the
  // window stays.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fit({ x: widthOfWindow() / 2, y: zoom.mode === 'page' ? document.documentElement.clientHeight / 2 : 0 }), 100);
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
      contentKey = keyOfContent();
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
    contentKey = keyOfContent();
    if (paperData()) {
      enterPaperMode();
      // After VS Code loaded the page again for the same content, the pages of before show at once.
      if (!showKeptPages()) {
        schedule(0);
      }
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
