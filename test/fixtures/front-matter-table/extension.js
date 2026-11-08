// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A test extension of the tests in VS Code (.vscode-test.mjs, test/vscode/extension.test.ts). Its markdown-it plugin
// shows the front matter of a Markdown file as a table of its own, with a token of its own type and not the token
// `front_matter` of VS Code, as some extensions of the Markdown preview do, for example "Markdown yaml Preamble". VS
// Code adds its own rule of the front matter after the plugins of the extensions, so this rule reads the front matter
// first. The Markdown preview of a paper document must not show the front matter (R-PRV-005).

/** tokenType is the type of the token of the table, and the class of the table. */
const tokenType = 'test_front_matter_table';

/**
 * isFence tells whether a line is a fence of the front matter: `---` with nothing after it but spaces.
 * @param {import('markdown-it').StateBlock} state - The state of the block parser.
 * @param {number} line - The index of the line.
 */
const isFence = (state, line) => state.src.slice(state.bMarks[line], state.eMarks[line]).trimEnd() === '---';

exports.activate = () => ({
  /**
   * extendMarkdownIt adds the rule and the rendering of the table.
   * @param {import('markdown-it')} md - The markdown-it instance of the Markdown preview.
   */
  extendMarkdownIt(md) {
    md.block.ruler.before(
      'fence',
      tokenType,
      (state, startLine, endLine, silent) => {
        if (startLine !== 0 || !isFence(state, 0)) {
          return false;
        }
        let end = 1;
        while (end < endLine && !isFence(state, end)) {
          end++;
        }
        if (end >= endLine) {
          return false;
        }
        if (!silent) {
          const token = state.push(tokenType, 'table', 0);
          token.block = true;
          token.map = [startLine, end + 1];
          token.meta = [];
          for (let line = 1; line < end; line++) {
            const field = /^([\w-]+):\s*(.*)$/.exec(state.src.slice(state.bMarks[line], state.eMarks[line]));
            if (field) {
              token.meta.push(field.slice(1));
            }
          }
          state.line = end + 1;
        }
        return true;
      },
      { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
    );
    md.renderer.rules[tokenType] = (tokens, index) => {
      const fields = tokens[index].meta;
      const row = (cells, tag) => `<tr>${cells.map((cell) => `<${tag}>${md.utils.escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
      return `<table class="${tokenType}">${row(fields.map((field) => field[0]), 'th')}${row(fields.map((field) => field[1]), 'td')}</table>\n`;
    };
    return md;
  },
});
