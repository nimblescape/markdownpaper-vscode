// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests in a real VS Code (npm run test:vscode): @vscode/test-cli downloads VS Code to .vscode-test/, starts it
// with the extension of the development build in dist/, and runs the bundled tests of out/test/vscode/
// (scripts/build-vscode-tests.mjs) with mocha in its extension host. The tests write their Markdown files into a
// temporary folder. VSCODE_TEST_VERSION selects the VS Code version: "stable" (the default), "insiders" or a version
// such as 1.125.0. On Linux without a display, run it under xvfb-run. VS Code loads two test extensions next to the
// extension: the markdown-it plugin of test/fixtures/front-matter-table/ shows the front matter as a table of its own,
// which the Markdown preview of a paper document must not show (R-PRV-005), and the plugin of test/fixtures/footnotes/
// adds markdown-it-footnote, as "Markdown Footnotes" does, whose footnotes the page preview and the PDF of a paper
// document must not show a second time (R-REN-010).
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'vscode',
    files: 'out/test/vscode/*.test.js',
    extensionDevelopmentPath: [
      fileURLToPath(new URL('.', import.meta.url)),
      fileURLToPath(new URL('test/fixtures/front-matter-table', import.meta.url)),
      fileURLToPath(new URL('test/fixtures/footnotes', import.meta.url)),
    ],
    version: process.env.VSCODE_TEST_VERSION || 'stable',
    // The built-in extensions stay on, among them the Markdown extension, which gives Markdown files their language.
    launchArgs: ['--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    mocha: {
      ui: 'bdd',
      // The first start of VS Code can be slow on CI runners.
      timeout: 60_000,
    },
  },
]);
