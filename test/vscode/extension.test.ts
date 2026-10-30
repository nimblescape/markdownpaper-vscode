/// <reference types="mocha" />
// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs): mocha runs them in the extension host. They write a
// layout and Markdown files into a temporary folder, and check the commands of the extension, the checks of the front
// matter and their hover (R-DOC-002, R-DOC-003), the format step of the paper (R-REN-004, R-CLI-002), the plugin of
// the pages in the Markdown preview of VS Code for a paper document and none for a notes document (R-PRV-001,
// R-PRV-005, R-DOC-004), and "Export PDF" (R-PDF-001), with the diagrams of Mermaid and the math of KaTeX of the
// built-in Markdown extensions (R-REN-010), when a Chrome, Chromium or Edge is installed, as on the runners of GitHub.
// The test of the script of the pages, which needs a browser page, is in src/paperPreview.test.ts.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { markdownExtensions } from '../../src/markdownExtensions';
import { findBrowser } from '../../src/pdf/browser';
import { Browser } from '../../src/pdf/cdp';
import { exportPdf } from '../../src/pdf/export';

/** extensionId is the identifier of the extension. */
const extensionId = 'nimblescape.nimblescape-markdownpaper';

/** api returns the export of the active extension. */
async function api(): Promise<Api> {
  const extension = vscode.extensions.getExtension<Api>(extensionId);
  assert.ok(extension, `the extension ${extensionId} is installed`);
  return extension.isActive ? extension.exports : extension.activate();
}

/**
 * waitFor returns the first value of a function that is not undefined, or fails after a time.
 * @param read - The function.
 * @param what - What the test waits for, for the message of the failure.
 * @param timeout - The time in milliseconds.
 */
async function waitFor<T>(read: () => T | undefined, what: string, timeout = 20_000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > end) {
      throw new Error(`timeout: ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** folder is the temporary folder of the files of the tests. */
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-vscode-'));

/**
 * write writes a file of the tests and returns its URI.
 * @param name - The path of the file in the folder.
 * @param text - The text.
 */
function write(name: string, text: string): vscode.Uri {
  const file = path.join(folder, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return vscode.Uri.file(file);
}

write(
  'layouts/thesis/layout.json',
  JSON.stringify({ format: 'nimblescape-layout 1.0.0', name: 'Thesis', language: 'de-AT', fields: { title: { description: 'Der Titel der Arbeit.', required: true } }, pdfName: '{{title}}' }),
);
write('layouts/thesis/page.css', '@page { size: A5; margin: 15mm; }\n');

describe('nimblescape Markdown Paper', function () {
  this.timeout(120_000);

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('the extension starts and has its commands', async () => {
    await api();
    const commands = await vscode.commands.getCommands(true);
    for (const name of ['showPagePreview', 'exportPdf', 'newProject', 'newDocument', 'newLayout']) {
      assert.ok(commands.includes(`nimblescape.markdownPaper.${name}`), name);
    }
  });

  it('a missing required field of the layout is a warning at the field layout, with the description in its hover (R-DOC-002, R-DOC-003)', async () => {
    const extension = await api();
    const file = write('paper/missing.md', '---\nlayout: thesis\n---\n\n# Einleitung\n');
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document);
    const problems = await waitFor(() => (extension.problemsOf(file).length > 0 ? extension.problemsOf(file) : undefined), 'the warning of the missing title');
    assert.equal(problems[0].range.start.line, 1);
    assert.match(problems[0].message, /The layout "thesis" needs the field "title": Der Titel der Arbeit\./);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(file, new vscode.Position(2, 0), 'title: Agenten\n');
    await vscode.workspace.applyEdit(edit);
    await waitFor(() => (extension.problemsOf(file).length === 0 ? true : undefined), 'no warning after the title');
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', file, new vscode.Position(2, 2));
    const text = hovers.flatMap((hover) => hover.contents.map((content) => (typeof content === 'string' ? content : content.value))).join('\n').replaceAll('&nbsp;', ' ');
    assert.match(text, /Der Titel der Arbeit\./);
  });

  it('the format step of the paper writes the table of contents of a paper document, for the formatter of Markdown Notes (R-REN-004, R-CLI-002)', async () => {
    const extension = await api();
    const file = write('paper/lists.md', '---\nlayout: plain\nlang: de-AT\n---\n\n# Inhaltsverzeichnis\n\n# Einleitung\n');
    const lines = (await vscode.workspace.openTextDocument(file)).getText().split('\n');
    await waitFor(() => (extension.formatStep.applies(lines, file) ? true : undefined), 'the layout of the format step');
    assert.deepEqual(extension.formatStep.format(lines, file).slice(5, 10), ['# Inhaltsverzeichnis', '', '<!-- toc -->', '- [1 Einleitung](#einleitung)', '<!-- /toc -->']);
    // A notes document gets no step of the paper.
    const notes = write('paper/notes-only.md', '# Inhaltsverzeichnis\n');
    await vscode.workspace.openTextDocument(notes);
    assert.equal(extension.formatStep.applies(['# Inhaltsverzeichnis', ''], notes), false);
  });

  it('the Markdown preview of a paper document gets the layout and the steps of the renderer, with the content of the other plugins, and a notes document keeps its preview (R-PRV-001, R-PRV-005, R-DOC-004)', async () => {
    await api();
    const paper = write('paper/preview.md', '---\nlayout: thesis\ntitle: Agenten\n---\n\n# Einleitung\n\nDie Formel $a^2 + b^2 = c^2$.[^1]\n\n[^1]: Eine Fußnote.\n');
    const document = await vscode.workspace.openTextDocument(paper);
    await vscode.window.showTextDocument(document);
    // The first rendering can come before the extension read the layout; then the preview renders again.
    let rendered = '';
    const end = Date.now() + 30_000;
    do {
      rendered = await vscode.commands.executeCommand<string>('markdown.api.render', document);
      if (rendered.includes('&quot;layout&quot;:&quot;thesis&quot;')) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < end);
    assert.match(rendered, /^<div class="nimblescape-paper" hidden data-paper="[^"]*&quot;layout&quot;:&quot;thesis&quot;/);
    assert.match(rendered, /&quot;language&quot;:&quot;de-AT&quot;/);
    assert.match(rendered, /size: A5/, 'the style sheet of the layout');
    assert.match(rendered, /<h1[^>]* id="einleitung"[^>]*><span class="heading-number">1<\/span> Einleitung<\/h1>/);
    assert.match(rendered, /class="katex"/, 'the math of the built-in extension Markdown Math');
    assert.match(rendered, /<span class="footnote"/, 'the footnote at its reference, for the foot of its page');
    const notes = await vscode.workspace.openTextDocument(write('paper/notes.md', '# Notizen\n\nText.[^1]\n\n[^1]: Fußnote.\n'));
    const plain = await vscode.commands.executeCommand<string>('markdown.api.render', notes);
    assert.doesNotMatch(plain, /nimblescape-paper|heading-number|class="footnote"/);
  });

  it('"Show Page Preview" opens the Markdown preview of VS Code beside the text editor (R-PRV-001)', async () => {
    await api();
    const paper = write('paper/show.md', '---\nlayout: thesis\ntitle: Agenten\n---\n\n# Einleitung\n\nText.\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(paper));
    await vscode.commands.executeCommand('nimblescape.markdownPaper.showPagePreview');
    await waitFor(() => {
      const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
      return tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('markdown.preview')) ? true : undefined;
    }, 'the Markdown preview of VS Code');
    assert.equal(vscode.window.tabGroups.all.length, 2, 'the preview is beside the text editor');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('"Export PDF" writes the PDF beside the file, with the name of its layout (R-PDF-001)', async function () {
    let browser: string;
    try {
      browser = findBrowser(vscode.workspace.getConfiguration('nimblescape.markdownPaper').get<string>('browserPath') ?? '');
    } catch {
      this.skip();
      return;
    }
    await api();
    await vscode.workspace.getConfiguration('nimblescape.markdownPaper').update('openPdf', false, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('nimblescape.markdownPaper').update('browserPath', browser, vscode.ConfigurationTarget.Global);
    const file = write('paper/export.md', '---\nlayout: thesis\ntitle: Agenten im Team\n---\n\n# Einleitung\n\nText.\n');
    const pdf = await vscode.commands.executeCommand<vscode.Uri | undefined>('nimblescape.markdownPaper.exportPdf', file);
    assert.ok(pdf, 'the command returns the PDF');
    assert.equal(path.basename(pdf.fsPath), 'Agenten-im-Team.pdf');
    assert.equal(fs.readFileSync(pdf.fsPath).subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('the pages of the PDF show the diagrams of Mermaid and the math of KaTeX of the Markdown extensions of VS Code (R-REN-010)', async function () {
    let browser: string;
    try {
      browser = findBrowser(vscode.workspace.getConfiguration('nimblescape.markdownPaper').get<string>('browserPath') ?? '');
    } catch {
      this.skip();
      return;
    }
    await api();
    const own = vscode.extensions.getExtension(extensionId)?.extensionUri;
    assert.ok(own);
    const extensions = await markdownExtensions(own);
    assert.ok(extensions.plugins.length >= 2, 'the plugins of Markdown Math and Mermaid');
    assert.ok(
      extensions.scripts.some((script) => 'src' in script && script.module && /mermaid/.test(script.src)),
      'the module script of Mermaid',
    );
    assert.ok(!extensions.scripts.some((script) => 'src' in script && /markdown-language-features\/|paperPreview\.js/.test(script.src)), 'not the scripts of the preview itself');
    const file = write('paper/diagram.md', '---\nlayout: thesis\ntitle: Agenten\n---\n\n# Einleitung\n\nDie Formel $a^2 + b^2 = c^2$.\n\n```mermaid\ngraph LR\n  Alpha --> Beta\n```\n');
    const html = path.join(folder, 'paper', 'diagram.html');
    const result = await exportPdf(file.fsPath, {
      assets: { layouts: vscode.Uri.joinPath(own, 'layouts').fsPath, pagedJs: vscode.Uri.joinPath(own, 'media', 'paged.polyfill.js').fsPath },
      browser,
      html,
      extensions,
    });
    assert.equal(fs.readFileSync(result.pdf).subarray(0, 5).toString('latin1'), '%PDF-');
    assert.deepEqual(result.messages, []);
   
    // The page of the PDF in the browser, as it printed it.
    const running = await Browser.launch(browser);
    try {
      const { targetId } = (await running.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await running.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await running.send('Page.enable', {}, sessionId);
      const loaded = running.once('Page.loadEventFired', sessionId);
      await running.send('Page.navigate', { url: vscode.Uri.file(html).toString() }, sessionId);
      await loaded;
      const evaluated = (await running.send(
        'Runtime.evaluate',
        {
          expression: `new Promise((resolve) => { const done = () => { const pages = document.querySelector('.pagedjs_pages'); resolve({
            diagram: [...pages.querySelectorAll('svg')].some((svg) => svg.textContent.includes('Alpha') && svg.textContent.includes('Beta')),
            inside: [...pages.querySelectorAll('svg')].every((svg) => svg.getBoundingClientRect().right <= svg.closest('.pagedjs_page_content').getBoundingClientRect().right + 1),
            buttons: [...pages.querySelectorAll('.mermaid-zoom-controls')].filter((element) => getComputedStyle(element).display !== 'none').length,
            math: pages.querySelectorAll('.katex').length,
            font: document.fonts.check('16px KaTeX_Main'),
            light: document.body.classList.contains('vscode-light'),
          }); }; if (window.paperRendered) { done(); } else { document.addEventListener('paper-rendered', done); } })`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      )) as { result: { value: { diagram: boolean; inside: boolean; buttons: number; math: number; font: boolean; light: boolean } } };
      // The diagram stands inside the text of its page, without the buttons of the screen.
      assert.deepEqual(evaluated.result.value, { diagram: true, inside: true, buttons: 0, math: 1, font: true, light: true });
    } finally {
      await running.close();
    }
  });
});
