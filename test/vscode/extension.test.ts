/// <reference types="mocha" />
// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Tests in a real VS Code (npm run test:vscode, .vscode-test.mjs): mocha runs them in the extension host. They write a
// layout and Markdown files into a temporary folder, and check the commands of the extension, the checks of the front
// matter and their hover (R-DOC-002, R-DOC-003), the page preview with its pages from Paged.js (R-PRV-001), the page
// preview as the preview of a paper document (R-PRV-005), and "Export PDF" (R-PDF-001) when a Chrome, Chromium or Edge
// is installed, as on the runners of GitHub.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { findBrowser } from '../../src/pdf/browser';

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
    for (const name of ['showPagePreview', 'togglePagePreview', 'openPreview', 'exportPdf', 'newProject', 'newDocument', 'newLayout']) {
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

  it('the page preview shows the pages of the layout (R-PRV-001)', async () => {
    const extension = await api();
    const file = write('paper/preview.md', `---\nlayout: thesis\ntitle: Agenten\n---\n\n# Einleitung\n\n${'Ein Absatz über die Arbeit von Teams. '.repeat(400)}\n`);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
    await vscode.commands.executeCommand('nimblescape.markdownPaper.showPagePreview');
    const pages = await waitFor(() => {
      const count = extension.pagesOf(file);
      return count && count > 1 ? count : undefined;
    }, 'the pages of the preview', 60_000);
    assert.ok(pages > 1, `${pages} pages`);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('the preview of a paper document is the page preview, and a notes document keeps the Markdown preview of VS Code (R-DOC-004, R-PRV-005)', async () => {
    const extension = await api();
    const activeInput = () => vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const paper = write('paper/toggle.md', '---\nlayout: thesis\ntitle: Agenten\n---\n\n# Einleitung\n\nText.\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(paper));
    // Ctrl+Shift+V: the page preview in the group of the text editor, and again back to the text.
    await vscode.commands.executeCommand('nimblescape.markdownPaper.togglePagePreview');
    await waitFor(() => extension.pagesOf(paper), 'the page preview of the paper document', 60_000);
    const input = activeInput();
    assert.ok(input instanceof vscode.TabInputWebview && input.viewType.endsWith('nimblescape.markdownPaper.pagePreview'), 'the page preview is the active tab');
    assert.equal(vscode.window.tabGroups.all.length, 1, 'the page preview is in the group of the text editor');
    await vscode.commands.executeCommand('nimblescape.markdownPaper.togglePagePreview');
    await waitFor(() => (vscode.window.activeTextEditor?.document.uri.toString() === paper.toString() ? true : undefined), 'the text editor again');
    // "Open Preview" of a notes document opens the Markdown preview of VS Code.
    const notes = write('paper/notes.md', '# Notizen\n\nText.\n');
    await vscode.commands.executeCommand('nimblescape.markdownPaper.openPreview', notes);
    await waitFor(() => {
      const shown = activeInput();
      return shown instanceof vscode.TabInputWebview && shown.viewType.includes('markdown.preview') ? true : undefined;
    }, 'the Markdown preview of VS Code');
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
});
