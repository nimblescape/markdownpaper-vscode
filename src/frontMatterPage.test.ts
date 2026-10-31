// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the page of the view "Front Matter" (media/frontMatter.js, R-DOC-005) in a browser without a
 * window, with a stand-in for the function acquireVsCodeApi of VS Code that keeps the messages of the page. They need an
 * installed Chrome, Chromium or Edge, as the PDF does; on the runners of GitHub there is one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { formOf } from './paper/frontMatterForm';
import type { Layout } from './paper/layout';
import { findBrowser } from './pdf/browser';
import { Browser } from './pdf/cdp';

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
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-front-matter-'));

afterAll(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

/** layout is a layout with a required field, a parameter with a default, and a free field. */
const layout = {
  name: 'Thesis',
  language: 'de-AT',
  fields: {
    title: { description: 'Der Titel der Arbeit.', required: true },
    type: { description: 'Die Art der Arbeit.', required: false, default: 'Bachelorarbeit', values: ['Bachelorarbeit', 'Masterarbeit'] },
    author: { description: 'Die Verfasserin oder der Verfasser.', required: true },
    keywords: { description: 'Die Schlagwörter.', required: false },
  },
} as unknown as Layout;

/** evaluate returns the value of an expression in the page, after its promise. */
async function evaluate<T>(session: { browser: Browser; id: string }, expression: string): Promise<T> {
  const result = (await session.browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session.id)) as { result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } };
  if (result.exceptionDetails) {
    throw new Error(`${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}: ${expression}`);
  }
  return result.result.value;
}

describe('the page of the view "Front Matter" (R-DOC-005)', () => {
  it.skipIf(!browser)('shows one row for each field and the read-only references, and sends each change', { timeout: 60_000 }, async () => {
    const text = '---\nlayout: majikmate/markdownpaper-layout-pht/thesis@main\nrepos:\n  server: myorg/server@v2.1.0\nauthor: Anna\nkeywords: [Agenten, Teams]\nsigned: true\n---\n';
    const form = formOf(text, 'paper.md', layout);
    const page = path.join(folder, 'view.html');
    fs.writeFileSync(
      page,
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="${pathToFileURL(path.join(repository, 'media', 'frontMatter.css')).href}"></head>
<body><div id="form"></div>
<script>window.messages = []; window.acquireVsCodeApi = () => ({ postMessage: (message) => window.messages.push(message) });</script>
<script src="${pathToFileURL(path.join(repository, 'media', 'frontMatter.js')).href}"></script></body></html>`,
    );
    const running = await Browser.launch(browser as string);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      const session = { browser: running, id: sessionId };
      await running.send('Page.enable', {}, sessionId);
      const loaded = running.once('Page.loadEventFired', sessionId);
      await running.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);
      await loaded;
      expect(await evaluate(session, 'window.messages')).toEqual([{ type: 'ready' }]);
      await evaluate(session, `window.postMessage({ type: 'form', form: ${JSON.stringify(form)} }, '*'), new Promise((resolve) => setTimeout(resolve, 50))`);
      const shown = await evaluate<{ rows: string[]; required: string[]; warnings: string[]; select: string[]; placeholder: string; readOnly: string[]; lang: string }>(
        session,
        `(() => ({
          rows: [...document.querySelectorAll('.row')].map((row) => row.dataset.key),
          required: [...document.querySelectorAll('.row')].filter((row) => row.querySelector('.required')).map((row) => row.dataset.key),
          warnings: [...document.querySelectorAll('.warning')].map((warning) => warning.closest('.row').dataset.key + ': ' + warning.textContent),
          select: [...document.querySelector('select[data-key="type"]').options].map((option) => option.textContent),
          placeholder: document.querySelector('input[data-key="lang"]').placeholder,
          readOnly: [...document.querySelectorAll('.read-only .value')].map((value) => value.textContent),
          lang: document.querySelector('input[data-key="lang"]').value,
        }))()`,
      );
      expect(shown.rows).toEqual(['layout', 'repos', 'title', 'type', 'author', 'keywords', 'lang', 'signed']);
      expect(shown.required).toEqual(['title', 'author']);
      expect(shown.warnings).toEqual(['title: The layout needs this field.', 'signed: The layout does not use this key.']);
      expect(shown.select).toEqual(['Bachelorarbeit (default)', 'Bachelorarbeit', 'Masterarbeit']);
      expect(shown.placeholder).toBe('de-AT');
      expect(shown.readOnly).toEqual(['majikmate/markdownpaper-layout-pht/thesis@main', 'myorg/server@v2.1.0', '[ Agenten, Teams ]', 'true']);

      // A text line sends its value with Enter, a choice list at once, and the button removes the unknown key.
      await evaluate(session, `document.querySelector('input[data-key="title"]').focus()`);
      await running.send('Input.insertText', { text: '  Agenten im Team ' }, sessionId);
      for (const type of ['keyDown', 'keyUp']) {
        await running.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
      }
      await evaluate(
        session,
        `(() => {
          const type = document.querySelector('select[data-key="type"]');
          type.value = 'Masterarbeit';
          type.dispatchEvent(new Event('change'));
          document.querySelector('.row[data-key="signed"] button').click();
        })()`,
      );
      expect(await evaluate(session, 'window.messages.slice(1)')).toEqual([
        { type: 'change', key: 'title', value: 'Agenten im Team' },
        { type: 'change', key: 'type', value: 'Masterarbeit' },
        { type: 'change', key: 'signed', value: '' },
      ]);

      // A new form keeps the text that the author types in a row; no form shows the hint.
      await evaluate(session, `(() => { const author = document.querySelector('input[data-key="author"]'); author.focus(); author.value = 'Anna B'; })()`);
      await evaluate(session, `window.postMessage({ type: 'form', form: ${JSON.stringify(form)} }, '*'), new Promise((resolve) => setTimeout(resolve, 50))`);
      expect(await evaluate(session, `[document.activeElement.dataset.key, document.activeElement.value]`)).toEqual(['author', 'Anna B']);
      await evaluate(session, `window.postMessage({ type: 'form', form: null }, '*'), new Promise((resolve) => setTimeout(resolve, 50))`);
      expect(await evaluate(session, `document.querySelector('.hint').textContent`)).toBe('Open a Markdown file to see the fields of its front matter.');
    } finally {
      await running.close();
    }
  });
});
