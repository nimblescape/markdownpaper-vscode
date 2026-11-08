// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A test extension of the tests in VS Code (.vscode-test.mjs, test/vscode/extension.test.ts). Its markdown-it plugin
// adds markdown-it-footnote, with its inline footnotes `^[text]`, to every markdown-it that gets the plugins of the
// Markdown preview, as the extension "Markdown Footnotes" (bierner.markdown-footnotes) does, which Markdown Notes
// installs with its extension pack. The page preview and the PDF of a paper document show each footnote once, and the
// inline footnotes stay text (R-REN-010).

const footnote = require('markdown-it-footnote');

exports.activate = () => ({
  /**
   * extendMarkdownIt adds the footnotes.
   * @param {import('markdown-it')} md - The markdown-it instance of the Markdown preview or of the renderer.
   */
  extendMarkdownIt(md) {
    return md.use(footnote);
  },
});
