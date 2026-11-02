// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the diagrams of Mermaid of the command line (R-REN-016) without a browser: the settings
 * `markdown-mermaid.*` of a file `.vscode/settings.json`, the workspace folder of a document, and the elements that the
 * markdown-it plugin writes, as the Mermaid extension of VS Code writes them.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import MarkdownIt from 'markdown-it';
import { afterAll, expect, test } from 'vitest';
import { defaultMermaidSettings, mermaidParts, mermaidPlugin, mermaidSettingsOf } from './mermaid';
import { workspaceFolderOf, workspaceSettings } from './workspace';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-mermaid-')));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('the settings of Mermaid come from the settings of VS Code, and a missing or invalid value gets its default', () => {
  expect(defaultMermaidSettings).toEqual({ lightModeTheme: 'vscode', languages: ['mermaid'], maxTextSize: 50000 });
  expect(mermaidSettingsOf({ 'markdown-mermaid.lightModeTheme': 'forest', 'markdown-mermaid.languages': ['mermaid', 'mmd'], 'markdown-mermaid.maxTextSize': 90000 })).toEqual({
    lightModeTheme: 'forest',
    languages: ['mermaid', 'mmd'],
    maxTextSize: 90000,
  });
  expect(mermaidSettingsOf({ 'markdown-mermaid.lightModeTheme': 'pink', 'markdown-mermaid.languages': [1], 'markdown-mermaid.maxTextSize': -1 })).toEqual(defaultMermaidSettings);
});

test('the workspace folder of a document on the command line is the nearest folder with .vscode or .git, with its settings', () => {
  fs.mkdirSync(path.join(root, 'repository', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repository', 'thesis', '.vscode'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repository', 'thesis', 'paper'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repository', 'concept'), { recursive: true });
  fs.writeFileSync(path.join(root, 'repository', 'thesis', '.vscode', 'settings.json'), '{\n  // Forest\n  "markdown-mermaid.lightModeTheme": "forest",\n}\n');
  expect(workspaceFolderOf(path.join(root, 'repository', 'thesis', 'paper', 'paper.md'))).toBe(path.join(root, 'repository', 'thesis'));
  expect(workspaceFolderOf(path.join(root, 'repository', 'concept', 'paper.md'))).toBe(path.join(root, 'repository'));
  expect(workspaceSettings(path.join(root, 'repository', 'thesis'))).toEqual({ 'markdown-mermaid.lightModeTheme': 'forest' });
  expect(workspaceSettings(path.join(root, 'repository'))).toEqual({});
});

test('the plugin writes a diagram as the Mermaid extension of VS Code writes it, and leaves other code blocks', () => {
  const md = new MarkdownIt();
  mermaidPlugin({ ...defaultMermaidSettings, languages: ['mermaid', 'mmd'] })(md);
  const html = md.render('```mermaid\ngraph LR\n  A --> B\n```\n\n```mmd\npie\n```\n\n::: mermaid\nsequenceDiagram\n  A->>B: Frage\n:::\n\n```js\nconst a = 1 < 2;\n```\n');
  expect(html).toBe(
    [
      '<pre class="mermaid" style="all: unset;">graph LR\n  A --&gt; B</pre>\n',
      '<pre class="mermaid" style="all: unset;">pie</pre>\n',
      '<div class="mermaid">sequenceDiagram\n  A-&gt;&gt;B: Frage</div>',
      '<pre><code class="language-js">const a = 1 &lt; 2;\n</code></pre>\n',
    ].join(''),
  );
});

test('the page gets the settings before the module script of Mermaid', () => {
  const parts = mermaidParts(path.join(root, 'mermaid'), { ...defaultMermaidSettings, lightModeTheme: 'neutral' });
  expect(parts.scripts).toEqual([
    { text: 'window.paperMermaid = {"lightModeTheme":"neutral","maxTextSize":50000};' },
    { src: `file://${path.join(root, 'mermaid', 'mermaid.js').split(path.sep).join('/').replace(/^\/?/, '/')}`, module: true },
  ]);
});
