// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The script of the page preview (docs/requirements.md, R-PRV-001 to R-PRV-004). Paged.js made the first pages when
// the page loaded. For each new text, the extension sends the new page; the script makes its pages with a new
// Paged.js previewer in a hidden area, then removes the old pages and their styles and shows the new ones at the same
// place, so the preview does not flicker. A click on a page sends the line of the block under the pointer, and a click
// on a link to a web page or an e-mail address sends the link. The state of the webview keeps the file and the
// position, so that VS Code restores the preview after a restart.
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const state = vscode.getState() || {};
  const meta = document.querySelector('meta[name="paper-file"]');
  if (meta) {
    state.file = meta.getAttribute('content');
    vscode.setState(state);
  }
  let current = window.PagedPolyfill;
  let pending;
  let busy = false;

  const indicator = document.createElement('div');
  indicator.className = 'paper-busy';
  indicator.textContent = 'Making the pages …';
  indicator.setAttribute('data-pagedjs-ignore', '');

  function showBusy(on) {
    if (on) {
      document.documentElement.appendChild(indicator);
    } else {
      indicator.remove();
    }
  }

  function rendered() {
    showBusy(false);
    if (typeof state.scrollY === 'number') {
      window.scrollTo(0, state.scrollY);
    }
    vscode.postMessage({ type: 'rendered', pages: document.querySelectorAll('.pagedjs_page').length });
  }

  if (window.paperRendered) {
    rendered();
  } else {
    showBusy(true);
    document.addEventListener('paper-rendered', rendered, { once: true });
  }

  window.addEventListener(
    'scroll',
    () => {
      state.scrollY = window.scrollY;
      vscode.setState(state);
    },
    { passive: true },
  );

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target && target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        return;
      }
      event.preventDefault();
      vscode.postMessage({ type: 'link', href: link.href });
      return;
    }
    const block = target && target.closest('[data-line]');
    if (block) {
      vscode.postMessage({ type: 'reveal', line: Number(block.getAttribute('data-line')) });
    }
  });

  async function update(html) {
    const next = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(next.querySelectorAll('style')).map((style) => ({ [location.href]: style.textContent || '' }));
    for (const script of Array.from(next.body.querySelectorAll('script'))) {
      script.remove();
    }
    const template = document.createElement('template');
    template.innerHTML = next.body.innerHTML;
    for (const attribute of Array.from(document.body.attributes)) {
      if (attribute.name.startsWith('data-')) {
        document.body.removeAttribute(attribute.name);
      }
    }
    for (const attribute of Array.from(next.body.attributes)) {
      document.body.setAttribute(attribute.name, attribute.value);
    }
    const area = document.createElement('div');
    area.className = 'paper-next';
    document.body.appendChild(area);
    const scroll = window.scrollY;
    const previewer = new window.Paged.Previewer();
    try {
      await previewer.preview(template.content, styles, area);
    } catch (error) {
      area.remove();
      for (const style of previewer.polisher.inserted || []) {
        style.remove();
      }
      throw error;
    }
    for (const old of Array.from(document.querySelectorAll('.pagedjs_pages'))) {
      if (!area.contains(old)) {
        (old.closest('.paper-current') || old).remove();
      }
    }
    if (current && current.polisher) {
      for (const style of current.polisher.inserted || []) {
        style.remove();
      }
      if (current.polisher.styleEl) {
        current.polisher.styleEl.remove();
      }
    }
    current = previewer;
    area.className = 'paper-current';
    window.scrollTo(0, scroll);
  }

  async function work() {
    busy = true;
    showBusy(true);
    while (pending !== undefined) {
      const html = pending;
      pending = undefined;
      try {
        await update(html);
      } catch (error) {
        vscode.postMessage({ type: 'error', message: String((error && error.message) || error) });
      }
    }
    busy = false;
    rendered();
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'update' && typeof message.html === 'string') {
      pending = message.html;
      if (!busy) {
        void work();
      }
    }
  });
})();
