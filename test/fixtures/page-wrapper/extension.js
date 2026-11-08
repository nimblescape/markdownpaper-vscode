// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A test extension of the tests in VS Code (.vscode-test.mjs, test/vscode/extension.test.ts). Its markdown-it plugin
// puts two elements around the whole HTML of the Markdown preview, and its style sheet gives them the space around the
// text and the font of GitHub, as "Markdown Preview Github Styling" (bierner.markdown-preview-github-styles) does with
// its elements `.github-markdown-body` and `.github-markdown-content`. The pages of a paper document leave these
// elements out, as the PDF does not have them (R-PRV-005).

exports.activate = () => ({
  /**
   * extendMarkdownIt puts the elements around the HTML of each rendering.
   * @param {import('markdown-it')} md - The markdown-it instance of the Markdown preview.
   */
  extendMarkdownIt(md) {
    const render = md.renderer.render;
    md.renderer.render = (...args) => `<div class="test-page-wrapper"><div class="test-page-content">${render.apply(md.renderer, args)}</div></div>`;
    return md;
  },
});
